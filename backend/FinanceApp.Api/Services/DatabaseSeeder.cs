using FinanceApp.Api.Domain;
using FinanceApp.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace FinanceApp.Api.Services;

public static class DatabaseSeeder
{
    public static async Task InitializeAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync(cancellationToken);
        if (await db.Users.AnyAsync(cancellationToken)) return;

        var user = new User { Id = Guid.Parse("10000000-0000-0000-0000-000000000001"), DisplayName = "Clara Martins" };
        var food = new Category { UserId = user.Id, Name = "Alimentação", Kind = TransactionKind.Expense, Color = "#E9AD66" };
        var home = new Category { UserId = user.Id, Name = "Casa", Kind = TransactionKind.Expense, Color = "#74B796" };
        var salary = new Category { UserId = user.Id, Name = "Receitas", Kind = TransactionKind.Income, Color = "#197A57" };
        db.AddRange(user, food, home, salary);
        db.Transactions.AddRange(
            new Transaction { UserId = user.Id, Category = food, Description = "Continente", Amount = 42.65m, Kind = TransactionKind.Expense, Source = TransactionSource.Whatsapp, OccurredOn = DateOnly.FromDateTime(DateTime.UtcNow) },
            new Transaction { UserId = user.Id, Category = salary, Description = "Vencimento", Amount = 2300m, Kind = TransactionKind.Income, Source = TransactionSource.Bank, OccurredOn = DateOnly.FromDateTime(DateTime.UtcNow) },
            new Transaction { UserId = user.Id, Category = home, Description = "Galp Energia", Amount = 86.40m, Kind = TransactionKind.Expense, Source = TransactionSource.Whatsapp, OccurredOn = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)) });
        await db.SaveChangesAsync(cancellationToken);
    }
}
