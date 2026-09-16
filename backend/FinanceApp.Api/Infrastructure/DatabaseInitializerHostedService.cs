using FinanceApp.Api.Services;

namespace FinanceApp.Api.Infrastructure;

/// <summary>
/// Executa o seed da base de dados em segundo plano para não bloquear o arranque da API.
/// </summary>
public sealed class DatabaseInitializerHostedService(IServiceProvider services, ILogger<DatabaseInitializerHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Pequena espera para garantir que a API responde ao health check antes de ligar ao DB
        await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        try
        {
            await DatabaseSeeder.InitializeAsync(services, stoppingToken);
            logger.LogInformation("Base de dados inicializada com sucesso.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Falha ao inicializar a base de dados. A API continua disponível.");
        }
    }
}
