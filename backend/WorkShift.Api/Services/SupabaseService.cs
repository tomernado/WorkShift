using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using WorkShift.Api.Models;

namespace WorkShift.Api.Services;

/// <summary>
/// Wraps Supabase REST API using service role key (bypasses RLS — backend use only).
/// </summary>
public class SupabaseService
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    private readonly ILogger<SupabaseService> _logger;

    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    public SupabaseService(IConfiguration config, ILogger<SupabaseService> logger)
    {
        _logger = logger;
        _baseUrl = (config["Supabase:Url"] ?? throw new InvalidOperationException("Supabase:Url not configured"))
            .TrimEnd('/');
        var key = config["Supabase:ServiceRoleKey"]
            ?? throw new InvalidOperationException("Supabase:ServiceRoleKey not configured");

        _http = new HttpClient();
        _http.DefaultRequestHeaders.Add("apikey", key);
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
    }

    public async Task<List<Employee>> GetActiveEmployeesAsync()
    {
        var url = $"{_baseUrl}/rest/v1/profiles?role=neq.manager&is_active=eq.true&select=id,name,job_role,is_active";
        var json = await _http.GetStringAsync(url);
        var rows = JsonSerializer.Deserialize<List<JsonElement>>(json, JsonOpts) ?? [];
        return rows.Select(r => new Employee
        {
            Id = r.GetProperty("id").GetString() ?? "",
            Name = r.GetProperty("name").GetString() ?? "",
            JobRole = r.TryGetProperty("job_role", out var jr) && jr.ValueKind != JsonValueKind.Null
                ? jr.GetString() ?? ""
                : "",
            IsActive = r.GetProperty("is_active").GetBoolean()
        }).ToList();
    }

    public async Task<List<ShiftRequirement>> GetShiftRequirementsAsync()
    {
        var url = $"{_baseUrl}/rest/v1/shift_requirements?select=*";
        var json = await _http.GetStringAsync(url);
        var rows = JsonSerializer.Deserialize<List<JsonElement>>(json, JsonOpts) ?? [];
        return rows.Select(r => new ShiftRequirement
        {
            DayOfWeek = r.GetProperty("day_of_week").GetInt32(),
            ShiftType = r.GetProperty("shift_type").GetString() ?? "",
            RequiredWaiters = r.GetProperty("required_waiters").GetInt32(),
            RequiredCooks = r.GetProperty("required_cooks").GetInt32(),
            TargetDate = r.TryGetProperty("target_date", out var td) && td.ValueKind != JsonValueKind.Null
                ? DateOnly.Parse(td.GetString()!)
                : null
        }).ToList();
    }

    public async Task<Dictionary<string, ParsedConstraint>> GetApprovedConstraintsAsync(DateOnly weekStart)
    {
        var url = $"{_baseUrl}/rest/v1/constraints?week_start=eq.{weekStart:yyyy-MM-dd}&status=eq.approved&select=employee_id,parsed_json";
        var json = await _http.GetStringAsync(url);
        var rows = JsonSerializer.Deserialize<List<JsonElement>>(json, JsonOpts) ?? [];
        var result = new Dictionary<string, ParsedConstraint>();
        foreach (var r in rows)
        {
            var empId = r.GetProperty("employee_id").GetString();
            if (empId == null) continue;
            var parsedRaw = r.GetProperty("parsed_json").GetRawText();
            var constraint = JsonSerializer.Deserialize<ParsedConstraint>(parsedRaw, JsonOpts);
            if (constraint != null) result[empId] = constraint;
        }
        return result;
    }

    public async Task<string> UpsertScheduleAsync(DateOnly weekStart)
    {
        var url = $"{_baseUrl}/rest/v1/schedules";
        var body = JsonSerializer.Serialize(new
        {
            week_start = weekStart.ToString("yyyy-MM-dd"),
            status = "draft"
        });

        var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        req.Headers.Add("Prefer", "resolution=merge-duplicates,return=representation");

        var response = await _http.SendAsync(req);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        var arr = JsonSerializer.Deserialize<List<JsonElement>>(json, JsonOpts);
        if (arr == null || arr.Count == 0)
            throw new InvalidOperationException("Supabase did not return the upserted schedule row.");
        return arr[0].GetProperty("id").GetString()
            ?? throw new InvalidOperationException("Supabase returned a schedule row without an id.");
    }

    public async Task SaveShiftsAsync(string scheduleId, List<ScheduleShift> shifts)
    {
        // Delete existing draft shifts for this schedule
        var deleteResponse = await _http.DeleteAsync($"{_baseUrl}/rest/v1/schedule_shifts?schedule_id=eq.{scheduleId}");
        deleteResponse.EnsureSuccessStatusCode();

        if (shifts.Count == 0) return;

        var rows = shifts.Select(s => new
        {
            schedule_id = scheduleId,
            employee_id = s.EmployeeId,
            day_of_week = s.DayOfWeek,
            shift_type = s.ShiftType,
            is_conflict = s.IsConflict,
            conflict_reason = s.ConflictReason
        });

        var body = JsonSerializer.Serialize(rows);
        var req = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/rest/v1/schedule_shifts")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        req.Headers.Add("Prefer", "return=minimal");
        var response = await _http.SendAsync(req);
        response.EnsureSuccessStatusCode();
    }

    public async Task UpdateShiftAsync(string shiftId, string employeeId)
    {
        var url = $"{_baseUrl}/rest/v1/schedule_shifts?id=eq.{shiftId}";
        var body = JsonSerializer.Serialize(new
        {
            employee_id = employeeId,
            is_conflict = false,
            conflict_reason = (string?)null
        });
        var req = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        req.Headers.Add("Prefer", "return=minimal");
        var response = await _http.SendAsync(req);
        response.EnsureSuccessStatusCode();
    }

    public async Task PublishScheduleAsync(string scheduleId)
    {
        var url = $"{_baseUrl}/rest/v1/schedules?id=eq.{scheduleId}";
        var body = JsonSerializer.Serialize(new { status = "published" });
        var req = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        req.Headers.Add("Prefer", "return=minimal");
        var response = await _http.SendAsync(req);
        response.EnsureSuccessStatusCode();
    }

    public async Task<string> CreateEmployeeAsync(string name, string jobRole)
    {
        // Create auth user
        var authUrl = $"{_baseUrl}/auth/v1/admin/users";
        var email = $"{name.Replace(" ", ".")}@workshift.local";
        var authBody = JsonSerializer.Serialize(new
        {
            email,
            password = "0000",
            email_confirm = true,
            user_metadata = new { name }
        });
        var authReq = new HttpRequestMessage(HttpMethod.Post, authUrl)
        {
            Content = new StringContent(authBody, Encoding.UTF8, "application/json")
        };
        var authResp = await _http.SendAsync(authReq);
        authResp.EnsureSuccessStatusCode();
        var authJson = await authResp.Content.ReadAsStringAsync();
        using var authDoc = JsonDocument.Parse(authJson);
        var userId = authDoc.RootElement.GetProperty("id").GetString()
            ?? throw new InvalidOperationException("Auth user creation did not return an id.");

        // Update the auto-created profile
        var profileUrl = $"{_baseUrl}/rest/v1/profiles?id=eq.{userId}";
        var profileBody = JsonSerializer.Serialize(new { name, role = "employee", job_role = jobRole });
        var profileReq = new HttpRequestMessage(HttpMethod.Patch, profileUrl)
        {
            Content = new StringContent(profileBody, Encoding.UTF8, "application/json")
        };
        profileReq.Headers.Add("Prefer", "return=minimal");
        var profileResp = await _http.SendAsync(profileReq);
        profileResp.EnsureSuccessStatusCode();

        return userId;
    }
}
