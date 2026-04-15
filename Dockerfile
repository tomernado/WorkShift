FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=""
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/WorkShift.Api/WorkShift.Api.csproj .
RUN dotnet restore
COPY backend/WorkShift.Api .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY --from=frontend-build /frontend/dist ./wwwroot
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "WorkShift.Api.dll"]
