# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["backend/FinanceApp.Api/FinanceApp.Api.csproj", "backend/FinanceApp.Api/"]
RUN dotnet restore "backend/FinanceApp.Api/FinanceApp.Api.csproj"
COPY . .
WORKDIR "/src/backend/FinanceApp.Api"
RUN dotnet publish "FinanceApp.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Usar shell para expandir $PORT dinamicamente (Render define PORT=10000 por padrão)
CMD ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-10000} dotnet FinanceApp.Api.dll"]
