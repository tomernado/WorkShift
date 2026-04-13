using Microsoft.AspNetCore.Mvc;
using WorkShift.Api.Services;

namespace WorkShift.Api.Controllers;

[ApiController]
[Route("api/constraints")]
public class ConstraintsController : ControllerBase
{
    private readonly ConstraintParserService _parser;

    public ConstraintsController(ConstraintParserService parser) => _parser = parser;

    [HttpPost("parse")]
    public async Task<IActionResult> Parse([FromBody] ParseRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest(new { error = "text is required" });

        var result = await _parser.ParseAsync(req.Text);
        return Ok(result);
    }

    public record ParseRequest(string Text);
}
