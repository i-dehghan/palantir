DIDEBAN local development configuration

1) Extract at D:\project\Dideban preserving directories.
2) CAUTION: appsettings.Development.json and .env contain DEVELOPMENT secrets. Do not commit or publish.
3) Add these entries to root .gitignore:
   src/backend-dotnet/Dideban.Api/appsettings.Development.json
   src/intelligence-py/.env
4) If the Development JSON is already tracked, gitignore alone is insufficient. Use git status and exclude secrets before committing; consider a local override instead.
5) Run Python: cd src\intelligence-py ; python run_development.py
6) Run .NET: cd src\backend-dotnet\Dideban.Api ; dotnet run
7) Ensure ASPNETCORE_ENVIRONMENT=Development (check launchSettings.json).
8) Restart both services after changing Registry key.
9) Bootstrap admin password is NOT stored in these files.
