using FinanceApp.Api.Contracts;
using FinanceApp.Api.Domain;
using FinanceApp.Api.Infrastructure;
using FinanceApp.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Supabase");
if (string.IsNullOrWhiteSpace(connectionString))
{
    connectionString = "Data Source=finance_app.db";
}

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (connectionString.Contains("Data Source=", StringComparison.OrdinalIgnoreCase) || connectionString.EndsWith(".db", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(connectionString);
    }
    else
    {
        options.UseNpgsql(connectionString);
    }
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
    if (allowedOrigins == null || allowedOrigins.Length == 0 || allowedOrigins.Contains("*"))
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    }
    else
    {
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
    }
}));

var app = builder.Build();
app.UseHttpsRedirection();
app.UseCors();
if (app.Environment.IsDevelopment())
    await DatabaseSeeder.InitializeAsync(app.Services);

var api = app.MapGroup("/api");
api.MapGet("/health", () => Results.Ok(new { status = "ok", timestamp = DateTimeOffset.UtcNow }));

api.MapGet("/dashboard", async (AppDbContext db, ICurrentUser currentUser, int? year, int? month, CancellationToken ct) =>
{
    var now = DateTime.UtcNow;
    var targetYear = year ?? now.Year;
    var targetMonth = month ?? now.Month;
    var transactions = await db.Transactions.AsNoTracking()
        .Where(x => x.UserId == currentUser.Id && x.OccurredOn.Year == targetYear && x.OccurredOn.Month == targetMonth && x.Status == TransactionStatus.Confirmed)
        .Include(x => x.Category).ToListAsync(ct);
    var income = transactions.Where(x => x.Kind == TransactionKind.Income).Sum(x => x.Amount);
    var expenses = transactions.Where(x => x.Kind == TransactionKind.Expense).Sum(x => x.Amount);
    var byCategory = transactions.Where(x => x.Kind == TransactionKind.Expense)
        .GroupBy(x => new { Name = x.Category?.Name ?? "Sem categoria", Color = x.Category?.Color ?? "#99C8DF" })
        .Select(x => new { x.Key.Name, x.Key.Color, amount = x.Sum(y => y.Amount) }).OrderByDescending(x => x.amount);
    return Results.Ok(new { period = new { year = targetYear, month = targetMonth }, income, expenses, savings = income - expenses, expensesByCategory = byCategory });
});

api.MapGet("/transactions", async (AppDbContext db, ICurrentUser currentUser, int? year, int? month, CancellationToken ct) =>
{
    var query = db.Transactions.AsNoTracking().Where(x => x.UserId == currentUser.Id).Include(x => x.Category).AsQueryable();
    if (year is not null) query = query.Where(x => x.OccurredOn.Year == year);
    if (month is not null) query = query.Where(x => x.OccurredOn.Month == month);
    var items = await query.OrderByDescending(x => x.OccurredOn).ThenByDescending(x => x.CreatedAt).ToListAsync(ct);
    return Results.Ok(items.Select(x => new { x.Id, x.Description, x.Amount, x.Kind, x.Source, x.Status, x.OccurredOn, category = x.Category?.Name }));
});

api.MapPost("/transactions", async (CreateTransactionRequest request, AppDbContext db, ICurrentUser currentUser, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Description) || request.Amount <= 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["transaction"] = ["Descrição e valor positivo são obrigatórios."] });
    if (request.CategoryId is not null && !await db.Categories.AnyAsync(x => x.Id == request.CategoryId && x.UserId == currentUser.Id, ct)) return Results.BadRequest(new { error = "Categoria inválida." });
    var transaction = new Transaction { UserId = currentUser.Id, Description = request.Description.Trim(), Amount = request.Amount, Kind = request.Kind, CategoryId = request.CategoryId, OccurredOn = request.OccurredOn, Source = TransactionSource.Manual };
    db.Transactions.Add(transaction); await db.SaveChangesAsync(ct);
    return Results.Created($"/api/transactions/{transaction.Id}", new { transaction.Id });
});

api.MapGet("/categories", async (AppDbContext db, ICurrentUser currentUser, CancellationToken ct) =>
    Results.Ok(await db.Categories.AsNoTracking().Where(x => x.UserId == currentUser.Id).OrderBy(x => x.Name).ToListAsync(ct)));

api.MapPost("/categories", async (CreateCategoryRequest request, AppDbContext db, ICurrentUser currentUser, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Name)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Nome é obrigatório."] });
    var category = new Category { UserId = currentUser.Id, Name = request.Name.Trim(), Kind = request.Kind, Color = request.Color ?? "#197A57" };
    db.Categories.Add(category); await db.SaveChangesAsync(ct); return Results.Created($"/api/categories/{category.Id}", category);
});

api.MapGet("/planning", async (AppDbContext db, ICurrentUser currentUser, int year, int month, CancellationToken ct) =>
{
    var budgets = await db.Budgets.AsNoTracking().Where(x => x.UserId == currentUser.Id && x.Year == year && x.Month == month).Include(x => x.Category).ToListAsync(ct);
    var spend = await db.Transactions.AsNoTracking().Where(x => x.UserId == currentUser.Id && x.CategoryId != null && x.Kind == TransactionKind.Expense && x.OccurredOn.Year == year && x.OccurredOn.Month == month && x.Status == TransactionStatus.Confirmed).GroupBy(x => x.CategoryId!.Value).Select(x => new { categoryId = x.Key, amount = x.Sum(y => y.Amount) }).ToDictionaryAsync(x => x.categoryId, x => x.amount, ct);
    return Results.Ok(budgets.Select(x => new { x.Id, category = x.Category?.Name, x.Limit, spent = spend.GetValueOrDefault(x.CategoryId), remaining = x.Limit - spend.GetValueOrDefault(x.CategoryId) }));
});

api.MapPost("/budgets", async (CreateBudgetRequest request, AppDbContext db, ICurrentUser currentUser, CancellationToken ct) =>
{
    if (request.Limit <= 0 || request.Month is < 1 or > 12) return Results.BadRequest(new { error = "Limite e mês inválidos." });
    var category = await db.Categories.SingleOrDefaultAsync(x => x.Id == request.CategoryId && x.UserId == currentUser.Id, ct);
    if (category is null) return Results.NotFound();
    var budget = await db.Budgets.SingleOrDefaultAsync(x => x.UserId == currentUser.Id && x.CategoryId == request.CategoryId && x.Year == request.Year && x.Month == request.Month, ct);
    if (budget is null) { budget = new Budget { UserId = currentUser.Id, CategoryId = request.CategoryId, Year = request.Year, Month = request.Month }; db.Budgets.Add(budget); }
    budget.Limit = request.Limit; await db.SaveChangesAsync(ct); return Results.Ok(new { budget.Id });
});

api.MapGet("/bank-connections", async (AppDbContext db, ICurrentUser currentUser, CancellationToken ct) => Results.Ok(await db.BankConnections.AsNoTracking().Where(x => x.UserId == currentUser.Id).ToListAsync(ct)));
api.MapPost("/bank-connections", async (StartBankConnectionRequest request, AppDbContext db, ICurrentUser currentUser, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Provider) || string.IsNullOrWhiteSpace(request.InstitutionName)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["bank"] = ["Fornecedor e banco são obrigatórios."] });
    var connection = new BankConnection { UserId = currentUser.Id, Provider = request.Provider.Trim(), InstitutionName = request.InstitutionName.Trim() };
    db.BankConnections.Add(connection); await db.SaveChangesAsync(ct);
    // The selected AISP provider callback URL belongs here; never collect bank credentials in this API.
    return Results.Accepted($"/api/bank-connections/{connection.Id}", new { connection.Id, status = connection.Status });
});
api.MapDelete("/bank-connections/{id:guid}", async (Guid id, AppDbContext db, ICurrentUser currentUser, CancellationToken ct) =>
{
    var connection = await db.BankConnections.SingleOrDefaultAsync(x => x.Id == id && x.UserId == currentUser.Id, ct);
    if (connection is null) return Results.NotFound(); db.BankConnections.Remove(connection); await db.SaveChangesAsync(ct); return Results.NoContent();
});

api.MapPost("/webhooks/whatsapp/attachments", async (WhatsappAttachmentRequest request, AppDbContext db, ICurrentUser currentUser, CancellationToken ct) =>
{
    var attachment = new Attachment { UserId = currentUser.Id, StoragePath = request.StoragePath, ContentType = request.ContentType, SizeBytes = request.SizeBytes, Source = "whatsapp", ProcessingStatus = "pending" };
    db.Attachments.Add(attachment); await db.SaveChangesAsync(ct);
    // A worker will download the media, run document extraction, then create a pending transaction for confirmation.
    return Results.Accepted($"/api/attachments/{attachment.Id}", new { attachment.Id, attachment.ProcessingStatus });
});

app.Run();
