using System.Net;
using System.Text;
using System.Text.Json;
using Moq;
using Moq.Protected;
using WorkShift.Api.Models;
using WorkShift.Api.Services;
using Xunit;

namespace WorkShift.Api.Tests;

public class ConstraintParserServiceTests
{
    private static ConstraintParserService BuildService(string claudeResponseJson)
    {
        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler
            .Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(claudeResponseJson, Encoding.UTF8, "application/json")
            });

        var httpClient = new HttpClient(mockHandler.Object);
        return new ConstraintParserService(httpClient, "fake-api-key");
    }

    [Fact]
    public async Task Parse_ReturnsParsedConstraint_OnValidClaudeResponse()
    {
        var innerJson = JsonSerializer.Serialize(new
        {
            cannot_work = new[] { "tuesday_morning" },
            prefer_not = new[] { "wednesday_morning" },
            prefer = Array.Empty<string>(),
            notes = ""
        });

        var claudePayload = JsonSerializer.Serialize(new
        {
            content = new[]
            {
                new { type = "text", text = innerJson }
            }
        });

        var svc = BuildService(claudePayload);
        var result = await svc.ParseAsync("אני לא יכול ביום שלישי בבוקר");

        Assert.Contains("tuesday_morning", result.CannotWork);
        Assert.Contains("wednesday_morning", result.PreferNot);
    }

    [Fact]
    public async Task Parse_ReturnsEmptyConstraint_WhenClaudeResponseUnparseable()
    {
        var claudePayload = JsonSerializer.Serialize(new
        {
            content = new[] { new { type = "text", text = "לא הצלחתי להבין" } }
        });

        var svc = BuildService(claudePayload);
        var result = await svc.ParseAsync("בלה בלה בלה");

        Assert.Empty(result.CannotWork);
        Assert.Empty(result.PreferNot);
    }
}
