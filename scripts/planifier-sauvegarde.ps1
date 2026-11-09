param(
  [ValidatePattern('^(?:[01]\d|2[0-3]):[0-5]\d$')]
  [string]$Heure = '03:00',
  [string]$FichierEnvironnement,
  [switch]$Installer
)
$ErrorActionPreference = 'Stop'
$siteOht = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$scriptOht = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'sauvegarde.mjs')).Path
$nodeOht = (Get-Command node -ErrorAction Stop).Source
$argsOht = '"' + $scriptOht + '"'
if ($FichierEnvironnement) {
  $envOht = (Resolve-Path -LiteralPath $FichierEnvironnement).Path
  if ($envOht -ne (Join-Path $siteOht '.env.local')) { throw 'Le fichier doit être le .env.local du site.' }
  $argsOht = '--env-file="' + $envOht + '" ' + $argsOht
}
if (-not $Installer) {
  Write-Output ('Préparation uniquement : sauvegarde quotidienne à ' + $Heure + ', heure de cette machine. Aucun enregistrement.')
  Write-Output 'La machine doit rester allumée et la session utilisateur ouverte. Ajouter -Installer après configuration et validation.'
  exit 0
}
$declencheurOht = New-ScheduledTaskTrigger -Daily -At $Heure
$actionOht = New-ScheduledTaskAction -Execute $nodeOht -Argument $argsOht -WorkingDirectory $siteOht
$identiteOht = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principalOht = New-ScheduledTaskPrincipal -UserId $identiteOht -LogonType Interactive -RunLevel Limited
$reglagesOht = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName 'OHT-Sauvegarde-PostgreSQL' -Action $actionOht -Trigger $declencheurOht -Principal $principalOht -Settings $reglagesOht -Description 'Sauvegarde PostgreSQL OHT chiffrée vers le stockage privé configuré ; activation explicite dans les variables opérateur.'
