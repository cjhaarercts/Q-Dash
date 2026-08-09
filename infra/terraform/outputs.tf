output "api_base_url" {
  description = "Base URL for the webhook API."
  value       = aws_apigatewayv2_api.webhooks.api_endpoint
}

output "correlation_table_name" {
  description = "Correlation table name."
  value       = aws_dynamodb_table.correlation.name
}

output "processing_ledger_table_name" {
  description = "Processing ledger table name."
  value       = aws_dynamodb_table.processing_ledger.name
}

output "feed_dedup_table_name" {
  description = "Feed deduplication table name."
  value       = aws_dynamodb_table.feed_dedup.name
}

output "operational_alarm_names" {
  description = "CloudWatch alarm names for automation suppression and correlation issues."
  value = {
    for key, alarm in aws_cloudwatch_metric_alarm.operational : key => alarm.alarm_name
  }
}

output "operational_alarm_effective_config" {
  description = "Effective operational alarm settings after environment defaults and explicit overrides are applied."
  value = {
    environment = var.environment
    alarms = {
      for key, alarm in local.operational_metric_alarms : key => {
        enabled             = alarm.enabled
        threshold           = alarm.threshold
        period              = alarm.period
        evaluation_periods  = alarm.evaluation_periods
        datapoints_to_alarm = alarm.datapoints_to_alarm
        metric_name         = alarm.metric_name
      }
    }
  }
}

output "operational_dashboard_name" {
  description = "CloudWatch dashboard name for operational automation metrics."
  value       = aws_cloudwatch_dashboard.operational.dashboard_name
}

output "observability_query_definition_names" {
  description = "CloudWatch Logs Insights query definition names for operational troubleshooting."
  value = {
    for key, definition in aws_cloudwatch_query_definition.observability : key => definition.name
  }
}
