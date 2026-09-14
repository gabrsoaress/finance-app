namespace FinanceApp.Api.Services;

public interface ICurrentUser
{
    Guid Id { get; }
}

public sealed class CurrentUser(IHttpContextAccessor contextAccessor) : ICurrentUser
{
    // Temporary development identity. Replace with the authenticated JWT subject before production.
    public Guid Id => Guid.TryParse(contextAccessor.HttpContext?.Request.Headers["X-User-Id"], out var id)
        ? id
        : Guid.Parse("10000000-0000-0000-0000-000000000001");
}
