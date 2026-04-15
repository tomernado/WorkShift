using WorkShift.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p =>
        p.WithOrigins("http://localhost:5173")
         .AllowAnyHeader()
         .AllowAnyMethod()));

builder.Services.AddSingleton<SchedulerService>();
builder.Services.AddSingleton<ConstraintParserService>();
builder.Services.AddSingleton<SupabaseService>();

var app = builder.Build();
app.UseCors();
app.MapControllers();

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();
