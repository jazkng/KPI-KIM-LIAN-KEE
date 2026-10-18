param(
  [Parameter(Mandatory=$true)][string]$Project,
  [Parameter(Mandatory=$true)][string]$Location,
  [Parameter(Mandatory=$true)][string]$SchedulerServiceAccount
)
$ErrorActionPreference = 'Stop'
$contextUri = 'https://dev.kimliankee.app/api/context/sync'
# Service-account permission, provider configuration and the feature flag must be reviewed before running.
gcloud scheduler jobs create http klk-v2-daily-context --project=$Project --location=$Location --schedule='0 15 * * *' --time-zone='Asia/Kuala_Lumpur' --uri=$contextUri --http-method=POST --oidc-service-account-email=$SchedulerServiceAccount --oidc-token-audience=$contextUri --max-retry-attempts=0 --max-retry-duration=0s --attempt-deadline=120s --message-body='{}'
if ($LASTEXITCODE -ne 0) { throw 'Scheduler creation failed' }
