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
                _logger.LogWarning("Anthropic API returned {StatusCode}. Falling back to empty constraint.", response.StatusCode);
                return new ParsedConstraint();
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
            // Graceful fallback — the UI will show an empty chip grid for the user to fill manually
            _logger.LogWarning(ex, "ConstraintParser fallback: failed to parse constraints for input of length {Length}", text.Length);
            return new ParsedConstraint();
        }
    }
}
