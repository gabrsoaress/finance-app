# Dockerfile na raiz do repositório para o Render
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copiar arquivo de projeto e restaurar dependências
COPY ["backend/FinanceApp.Api/FinanceApp.Api.csproj", "backend/FinanceApp.Api/"]
RUN dotnet restore "backend/FinanceApp.Api/FinanceApp.Api.csproj"

# Copiar o restante do código e compilar
COPY . .
WORKDIR "/src/backend/FinanceApp.Api"
RUN dotnet publish "FinanceApp.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Estágio de execução
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Render define a variável PORT dinamicamente (padrão 10000)
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000

ENTRYPOINT ["dotnet", "FinanceApp.Api.dll"]
