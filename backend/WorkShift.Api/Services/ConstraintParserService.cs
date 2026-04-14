using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using WorkShift.Api.Models;

namespace WorkShift.Api.Services;

public class ConstraintParserService
{
    private readonly HttpClient _http;
    private readonly string _apiKey;
    private readonly ILogger<ConstraintParserService> _logger;

    private const string SystemPrompt = """
        You are a scheduling assistant. The user will describe their work availability in Hebrew or English.
        Extract their constraints and return ONLY valid JSON in this exact shape:
        {
          "cannot_work": ["day_shift", ...],
          "prefer_not": ["day_shift", ...],
          "prefer": ["day_shift", ...],
          "notes": ""
        }
        Slot format: lowercase English day name + underscore + shift type.
        Day names: sunday, monday, tuesday, wednesday, thursday, friday.
        Shift types: morning, evening.
        Examples: "sunday_morning", "wednesday_evening".
        Return ONLY the JSON object. No explanation, no markdown, no code fences.
        """;

    // Constructor for DI
    public ConstraintParserService(IConfiguration config, ILogger<ConstraintParserService> logger)
        : this(new HttpClient(), config["Anthropic:ApiKey"] ?? "", logger)
    {
        if (string.IsNullOrEmpty(config["Anthropic:ApiKey"]))
            logger.LogWarning("Anthropic:ApiKey is not configured. Constraint parsing will always return empty results.");
    }

    // Constructor for testing
    public ConstraintParserService(HttpClient httpClient, string apiKey, ILogger<ConstraintParserService>? logger = null)
    {
        _http = httpClient;
        _apiKey = apiKey;
        _logger = logger ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<ConstraintParserService>.Instance;
    }

    public async Task<ParsedConstraint> ParseAsync(string text)
    {
        if (string.IsNullOrEmpty(_apiKey))
            return ParseLocally(text);

        var requestBody = JsonSerializer.Serialize(new
        {
            model = "claude-sonnet-4-6",
            max_tokens = 512,
            system = SystemPrompt,
            messages = new[] { new { role = "user", content = text } }
        });

        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
        {
            Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("x-api-key", _apiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        try
        {
            var response = await _http.SendAsync(request);
            var json = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Anthropic API returned {StatusCode}. Falling back to local parser.", response.StatusCode);
                return ParseLocally(text);
            }

            using var doc = JsonDocument.Parse(json);
            var rawText = doc.RootElement
                .GetProperty("content")[0]
                .GetProperty("text")
                .GetString() ?? "";

            return JsonSerializer.Deserialize<ParsedConstraint>(rawText,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new ParsedConstraint();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ConstraintParser Claude call failed, falling back to local parser.");
            return ParseLocally(text);
        }
    }

    /// <summary>
    /// Rule-based Hebrew parser — no API required.
    /// Handles patterns like: "לא יכול ראשון בוקר", "עדיף לא שני", "לא יכולה ביום שלישי בערב"
    /// </summary>
    private static ParsedConstraint ParseLocally(string text)
    {
        var cannot = new List<string>();
        var preferNot = new List<string>();

        var dayMap = new Dictionary<string, string>
        {
            ["ראשון"] = "sunday",
            ["שני"]   = "monday",
            ["שלישי"] = "tuesday",
            ["רביעי"] = "wednesday",
            ["חמישי"] = "thursday",
            ["שישי"]  = "friday",
        };

        // Split on common Hebrew connectives + punctuation
        var clauses = System.Text.RegularExpressions.Regex.Split(
            text, @"[,،;וגם\n]|וגם|אבל|רק");

        foreach (var clause in clauses)
        {
            if (string.IsNullOrWhiteSpace(clause)) continue;

            bool isCannotWork = clause.Contains("לא יכול") || clause.Contains("לא יכולה")
                             || clause.Contains("לא אוכל") || clause.Contains("לא פנוי")
                             || clause.Contains("לא פנויה") || clause.Contains("חסום");

            bool isPreferNot = !isCannotWork &&
                               (clause.Contains("עדיף לא") || clause.Contains("מעדיף לא")
                             || clause.Contains("מעדיפה לא") || clause.Contains("לא נוח")
                             || clause.Contains("קשה לי"));

            if (!isCannotWork && !isPreferNot) continue;

            // Find days mentioned in this clause
            var days = dayMap
                .Where(kv => clause.Contains(kv.Key))
                .Select(kv => kv.Value)
                .ToList();

            if (days.Count == 0) continue;

            // Find shifts mentioned
            bool hasMorning = clause.Contains("בוקר");
            bool hasEvening = clause.Contains("ערב");
            var shifts = hasMorning || hasEvening
                ? new List<string>()
                : new List<string> { "morning", "evening" }; // no shift mentioned = both

            if (hasMorning) shifts.Add("morning");
            if (hasEvening) shifts.Add("evening");

            var slots = days.SelectMany(d => shifts.Select(s => $"{d}_{s}")).ToList();

            if (isCannotWork) cannot.AddRange(slots);
            else preferNot.AddRange(slots);
        }

        return new ParsedConstraint
        {
            CannotWork = cannot.Distinct().ToList(),
            PreferNot  = preferNot.Distinct().ToList(),
            Prefer     = [],
            Notes      = "",
        };
    }
}
