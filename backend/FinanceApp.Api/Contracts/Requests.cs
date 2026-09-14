using FinanceApp.Api.Domain;

namespace FinanceApp.Api.Contracts;

public sealed record CreateTransactionRequest(string Description, decimal Amount, TransactionKind Kind, Guid? CategoryId, DateOnly OccurredOn);
public sealed record CreateCategoryRequest(string Name, TransactionKind Kind, string? Color);
public sealed record CreateBudgetRequest(Guid CategoryId, decimal Limit, int Year, int Month);
public sealed record StartBankConnectionRequest(string Provider, string InstitutionName);
public sealed record WhatsappAttachmentRequest(string MediaId, string ContentType, long SizeBytes, string StoragePath);
