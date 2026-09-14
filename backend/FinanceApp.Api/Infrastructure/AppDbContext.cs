using FinanceApp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace FinanceApp.Api.Infrastructure;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<Budget> Budgets => Set<Budget>();
    public DbSet<BankConnection> BankConnections => Set<BankConnection>();
    public DbSet<Attachment> Attachments => Set<Attachment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>().ToTable("users");
        modelBuilder.Entity<Category>().ToTable("categories").HasIndex(x => new { x.UserId, x.Name, x.Kind }).IsUnique();
        modelBuilder.Entity<Transaction>().ToTable("transactions").HasIndex(x => new { x.UserId, x.OccurredOn });
        modelBuilder.Entity<Budget>().ToTable("budgets").HasIndex(x => new { x.UserId, x.CategoryId, x.Year, x.Month }).IsUnique();
        modelBuilder.Entity<BankConnection>().ToTable("bank_connections").HasIndex(x => new { x.UserId, x.Provider });
        modelBuilder.Entity<Attachment>().ToTable("attachments");
        modelBuilder.Entity<Transaction>().Property(x => x.Amount).HasPrecision(18, 2);
        modelBuilder.Entity<Budget>().Property(x => x.Limit).HasPrecision(18, 2);
        modelBuilder.Entity<Transaction>().HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<Budget>().HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Cascade);
    }
}
