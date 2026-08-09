locals {
  name_prefix = "${var.application_name}-${var.environment}"
  metric_namespace = "${local.name_prefix}/Operational"
  normalized_environment = lower(var.environment)

  common_tags = {
    Application = var.application_name
    Environment = var.environment
  }

  lambda_assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  lambda_environment = {
    ENVIRONMENT                    = var.environment
    STATE_STORE_DEDUP_TTL_SECONDS  = "1209600"
    ARC_GIS_RUNTIME_SECRET_ARN     = var.arcgis_runtime_secret_arn
    ARC_GIS_WEBHOOK_SECRET_ARN     = var.arcgis_webhook_secret_arn
    EVERBRIDGE_POLLING_SECRET_ARN  = var.everbridge_polling_secret_arn
    EVERBRIDGE_DRAFT_SECRET_ARN    = var.everbridge_draft_secret_arn
    EVERBRIDGE_WEBHOOK_SECRET_ARN  = var.everbridge_webhook_secret_arn
    CORRELATION_TABLE_NAME         = aws_dynamodb_table.correlation.name
    PROCESSING_LEDGER_TABLE_NAME   = aws_dynamodb_table.processing_ledger.name
    FEED_DEDUP_TABLE_NAME          = aws_dynamodb_table.feed_dedup.name
    ARC_GIS_WEBHOOK_HEADER_NAME    = "x-arcgis-webhook-secret"
    EVERBRIDGE_WEBHOOK_HEADER_NAME = "x-everbridge-webhook-secret"
  }

  lambda_configs = {
    arcgis_webhook = {
      function_name_suffix = "arcgis-webhook"
      handler              = "handlers/arcgisWebhookHandler.handler"
      timeout              = 10
      secret_arns          = [var.arcgis_runtime_secret_arn, var.arcgis_webhook_secret_arn]
      dynamo_arns          = [aws_dynamodb_table.correlation.arn, aws_dynamodb_table.processing_ledger.arn]
      dlq_arns             = [aws_sqs_queue.rules_dlq.arn]
    }
    everbridge_callback = {
      function_name_suffix = "everbridge-callback"
      handler              = "handlers/everbridgeCallbackHandler.handler"
      timeout              = 10
      secret_arns          = [var.arcgis_runtime_secret_arn, var.everbridge_polling_secret_arn, var.everbridge_webhook_secret_arn]
      dynamo_arns          = [aws_dynamodb_table.correlation.arn, aws_dynamodb_table.processing_ledger.arn, aws_dynamodb_table.feed_dedup.arn]
      dlq_arns             = [aws_sqs_queue.everbridge_dlq.arn]
    }
    everbridge_poller = {
      function_name_suffix = "everbridge-poller"
      handler              = "handlers/everbridgePoller.handler"
      timeout              = 30
      secret_arns          = [var.arcgis_runtime_secret_arn, var.everbridge_polling_secret_arn]
      dynamo_arns          = [aws_dynamodb_table.correlation.arn, aws_dynamodb_table.processing_ledger.arn]
      dlq_arns             = [aws_sqs_queue.everbridge_dlq.arn]
    }
    hazard_feed_poller = {
      function_name_suffix = "hazard-feed-poller"
      handler              = "handlers/hazardFeedPoller.handler"
      timeout              = 30
      secret_arns          = [var.arcgis_runtime_secret_arn]
      dynamo_arns          = [aws_dynamodb_table.correlation.arn, aws_dynamodb_table.processing_ledger.arn, aws_dynamodb_table.feed_dedup.arn]
      dlq_arns             = [aws_sqs_queue.rules_dlq.arn]
    }
    rules_evaluator = {
      function_name_suffix = "rules-evaluator"
      handler              = "handlers/rulesEvaluator.handler"
      timeout              = 15
      secret_arns          = []
      dynamo_arns          = [aws_dynamodb_table.correlation.arn, aws_dynamodb_table.processing_ledger.arn, aws_dynamodb_table.feed_dedup.arn]
      dlq_arns             = [aws_sqs_queue.rules_dlq.arn]
    }
    arcgis_writer = {
      function_name_suffix = "arcgis-writer"
      handler              = "handlers/arcgisWriter.handler"
      timeout              = 20
      secret_arns          = [var.arcgis_runtime_secret_arn]
      dynamo_arns          = [aws_dynamodb_table.correlation.arn, aws_dynamodb_table.processing_ledger.arn]
      dlq_arns             = [aws_sqs_queue.arcgis_dlq.arn]
    }
    everbridge_draft_creator = {
      function_name_suffix = "everbridge-draft"
      handler              = "handlers/everbridgeDraftCreator.handler"
      timeout              = 20
      secret_arns          = [var.everbridge_draft_secret_arn]
      dynamo_arns          = [aws_dynamodb_table.correlation.arn, aws_dynamodb_table.processing_ledger.arn]
      dlq_arns             = [aws_sqs_queue.everbridge_dlq.arn]
    }
  }

  operational_alarm_defaults = {
    hazard_missing_event_correlation = {
      enabled            = true
      lambda_key         = "hazard_feed_poller"
      metric_name        = "HazardMissingEventCorrelation"
      filter_pattern     = "{ ($.eventType = \"metric\") && ($.metricName = \"HazardMissingEventCorrelation\") }"
      period             = 900
      threshold          = 1
      evaluation_periods = 1
      datapoints_to_alarm = 1
      alarm_suffix       = "hazard-missing-event-correlation"
      alarm_description  = "Hazard feed polling could not resolve one or more event correlations during a poll window."
    }
    hazard_duplicate_suppression = {
      enabled            = true
      lambda_key         = "hazard_feed_poller"
      metric_name        = "HazardDuplicateSuppression"
      filter_pattern     = "{ ($.eventType = \"metric\") && ($.metricName = \"HazardDuplicateSuppression\") }"
      period             = 900
      threshold          = 1
      evaluation_periods = 1
      datapoints_to_alarm = 1
      alarm_suffix       = "hazard-duplicate-suppression"
      alarm_description  = "Hazard feed polling suppressed duplicate hazard updates in a poll window."
    }
    everbridge_poll_duplicate_suppression = {
      enabled            = true
      lambda_key         = "everbridge_poller"
      metric_name        = "EverbridgePollDuplicateSuppression"
      filter_pattern     = "{ ($.eventType = \"metric\") && ($.metricName = \"EverbridgePollDuplicateSuppression\") }"
      period             = 300
      threshold          = 1
      evaluation_periods = 1
      datapoints_to_alarm = 1
      alarm_suffix       = "everbridge-poll-duplicate-suppression"
      alarm_description  = "Everbridge polling suppressed duplicate notifications during a poll window."
    }
    everbridge_poll_missing_event_correlation = {
      enabled            = true
      lambda_key         = "everbridge_poller"
      metric_name        = "EverbridgePollMissingEventCorrelation"
      filter_pattern     = "{ ($.eventType = \"metric\") && ($.metricName = \"EverbridgePollMissingEventCorrelation\") }"
      period             = 300
      threshold          = 1
      evaluation_periods = 1
      datapoints_to_alarm = 1
      alarm_suffix       = "everbridge-poll-missing-event-correlation"
      alarm_description  = "Everbridge polling could not resolve one or more notification correlations during a poll window."
    }
    everbridge_callback_duplicate_suppression = {
      enabled            = true
      lambda_key         = "everbridge_callback"
      metric_name        = "EverbridgeCallbackDuplicateSuppression"
      filter_pattern     = "{ ($.eventType = \"metric\") && ($.metricName = \"EverbridgeCallbackDuplicateSuppression\") }"
      period             = 300
      threshold          = 1
      evaluation_periods = 1
      datapoints_to_alarm = 1
      alarm_suffix       = "everbridge-callback-duplicate-suppression"
      alarm_description  = "Everbridge callback processing suppressed duplicate callback deliveries."
    }
  }

  operational_alarm_profile_defaults = {
    default = {}
    dev = {
      hazard_duplicate_suppression = {
        enabled = false
      }
      everbridge_poll_missing_event_correlation = {
        threshold = 2
      }
      everbridge_poll_duplicate_suppression = {
        threshold = 2
      }
      everbridge_callback_duplicate_suppression = {
        threshold = 2
      }
    }
    test = {
      hazard_duplicate_suppression = {
        enabled = false
      }
    }
    prod = {
      hazard_missing_event_correlation = {
        threshold          = 1
        evaluation_periods = 1
        datapoints_to_alarm = 1
      }
      hazard_duplicate_suppression = {
        threshold          = 2
        evaluation_periods = 1
        datapoints_to_alarm = 1
      }
      everbridge_poll_duplicate_suppression = {
        threshold          = 1
        evaluation_periods = 1
        datapoints_to_alarm = 1
      }
      everbridge_poll_missing_event_correlation = {
        threshold          = 1
        evaluation_periods = 1
        datapoints_to_alarm = 1
      }
      everbridge_callback_duplicate_suppression = {
        threshold          = 1
        evaluation_periods = 1
        datapoints_to_alarm = 1
      }
    }
  }

  selected_operational_alarm_profile = merge(
    local.operational_alarm_profile_defaults.default,
    lookup(local.operational_alarm_profile_defaults, local.normalized_environment, {})
  )

  operational_metric_alarms = {
    for key, alarm in local.operational_alarm_defaults : key => merge(
      alarm,
      {
        enabled             = coalesce(try(local.selected_operational_alarm_profile[key].enabled, null), try(var.operational_alarm_overrides[key].enabled, null), alarm.enabled)
        threshold           = coalesce(try(local.selected_operational_alarm_profile[key].threshold, null), try(var.operational_alarm_overrides[key].threshold, null), alarm.threshold)
        period              = coalesce(try(local.selected_operational_alarm_profile[key].period, null), try(var.operational_alarm_overrides[key].period, null), alarm.period)
        evaluation_periods  = coalesce(try(local.selected_operational_alarm_profile[key].evaluation_periods, null), try(var.operational_alarm_overrides[key].evaluation_periods, null), alarm.evaluation_periods)
        datapoints_to_alarm = coalesce(try(local.selected_operational_alarm_profile[key].datapoints_to_alarm, null), try(var.operational_alarm_overrides[key].datapoints_to_alarm, null), alarm.datapoints_to_alarm)
      }
    )
  }

  enabled_operational_metric_alarms = {
    for key, alarm in local.operational_metric_alarms : key => alarm
    if alarm.enabled
  }

  enabled_hazard_metric_alarms = {
    for key, alarm in local.enabled_operational_metric_alarms : key => alarm
    if startswith(alarm.metric_name, "Hazard")
  }

  enabled_everbridge_metric_alarms = {
    for key, alarm in local.enabled_operational_metric_alarms : key => alarm
    if startswith(alarm.metric_name, "Everbridge")
  }

  observability_query_definitions = {
    metric_event_stream = {
      name = "${local.name_prefix}-metric-event-stream"
      query_string = <<-EOT
        fields @timestamp, metricName, dimensions, values, context
        | filter eventType = "metric"
        | sort @timestamp desc
        | limit 100
      EOT
    }
    correlation_failures = {
      name = "${local.name_prefix}-correlation-failures"
      query_string = <<-EOT
        fields @timestamp, metricName, values.count, dimensions, context
        | filter eventType = "metric"
        | filter metricName like /MissingEventCorrelation/
        | sort @timestamp desc
        | limit 100
      EOT
    }
    duplicate_suppressions = {
      name = "${local.name_prefix}-duplicate-suppressions"
      query_string = <<-EOT
        fields @timestamp, metricName, values.count, dimensions, context
        | filter eventType = "metric"
        | filter metricName like /DuplicateSuppression/
        | sort @timestamp desc
        | limit 100
      EOT
    }
    handler_summaries = {
      name = "${local.name_prefix}-handler-summaries"
      query_string = <<-EOT
        fields @timestamp, message, context
        | filter message in ["Polling hazard feed workflow.", "Polling Everbridge notifications.", "Received Everbridge callback."]
        | sort @timestamp desc
        | limit 100
      EOT
    }
  }

  operational_dashboard_widgets = [
    {
      type   = "text"
      x      = 0
      y      = 0
      width  = 24
      height = 4
      properties = {
        markdown = join("\n", [
          "# ${local.name_prefix} operational dashboard",
          "Environment: `${var.environment}`",
          "Namespace: `${local.metric_namespace}`",
          "This dashboard tracks alarmable automation suppression and correlation-failure metrics emitted by the poller and callback handlers."
        ])
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 4
      width  = 12
      height = 8
      properties = {
        title   = "Hazard metric counts"
        view    = "timeSeries"
        region  = var.aws_region
        stacked = false
        stat    = "Sum"
        period  = 900
        metrics = [
          for key, alarm in local.enabled_hazard_metric_alarms : [
            local.metric_namespace,
            alarm.metric_name,
            {
              label = alarm.metric_name
            }
          ]
        ]
      }
    },
    {
      type   = "metric"
      x      = 12
      y      = 4
      width  = 12
      height = 8
      properties = {
        title   = "Everbridge metric counts"
        view    = "timeSeries"
        region  = var.aws_region
        stacked = false
        stat    = "Sum"
        period  = 300
        metrics = [
          for key, alarm in local.enabled_everbridge_metric_alarms : [
            local.metric_namespace,
            alarm.metric_name,
            {
              label = alarm.metric_name
            }
          ]
        ]
      }
    },
    {
      type   = "alarm"
      x      = 0
      y      = 12
      width  = 24
      height = 6
      properties = {
        title  = "Operational alarm status"
        alarms = [
          for key, alarm in aws_cloudwatch_metric_alarm.operational : alarm.arn
        ]
      }
    }
  ]
}

data "archive_file" "lambda_bundle" {
  type        = "zip"
  source_dir  = abspath(var.lambda_source_dir)
  output_path = "${path.module}/build/${local.name_prefix}-lambda.zip"
}

resource "aws_dynamodb_table" "correlation" {
  name         = "${local.name_prefix}-correlation"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "processing_ledger" {
  name         = "${local.name_prefix}-processing-ledger"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "correlation_id"

  attribute {
    name = "correlation_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "feed_dedup" {
  name         = "${local.name_prefix}-feed-dedup"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "source_key"

  attribute {
    name = "source_key"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  ttl {
    attribute_name = "expires_at_epoch"
    enabled        = true
  }

  tags = local.common_tags
}

resource "aws_sqs_queue" "arcgis_dlq" {
  name = "${local.name_prefix}-arcgis-dlq"
  tags = local.common_tags
}

resource "aws_sqs_queue" "everbridge_dlq" {
  name = "${local.name_prefix}-everbridge-dlq"
  tags = local.common_tags
}

resource "aws_sqs_queue" "rules_dlq" {
  name = "${local.name_prefix}-rules-dlq"
  tags = local.common_tags
}

resource "aws_iam_role" "lambda_execution" {
  for_each = local.lambda_configs

  name               = "${local.name_prefix}-${each.value.function_name_suffix}-role"
  assume_role_policy = local.lambda_assume_role_policy
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "lambda_inline" {
  for_each = local.lambda_configs

  name = "${local.name_prefix}-${each.value.function_name_suffix}-inline"
  role = aws_iam_role.lambda_execution[each.key].id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = concat(
      [
        {
          Sid = "WriteLogs",
          Effect = "Allow",
          Action = [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          Resource = "*"
        }
      ],
      length(each.value.secret_arns) > 0 ? [
        {
          Sid = "ReadSecrets",
          Effect = "Allow",
          Action = [
            "secretsmanager:GetSecretValue"
          ],
          Resource = each.value.secret_arns
        }
      ] : [],
      length(each.value.dynamo_arns) > 0 ? [
        {
          Sid = "DynamoStateAccess",
          Effect = "Allow",
          Action = [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:Query"
          ],
          Resource = each.value.dynamo_arns
        }
      ] : [],
      length(each.value.dlq_arns) > 0 ? [
        {
          Sid = "DlqWrite",
          Effect = "Allow",
          Action = [
            "sqs:SendMessage"
          ],
          Resource = each.value.dlq_arns
        }
      ] : []
    )
  })
}

resource "aws_lambda_function" "service" {
  for_each = local.lambda_configs

  function_name    = "${local.name_prefix}-${each.value.function_name_suffix}"
  role             = aws_iam_role.lambda_execution[each.key].arn
  runtime          = "nodejs20.x"
  handler          = each.value.handler
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = each.value.timeout

  environment {
    variables = local.lambda_environment
  }

  logging_config {
    log_group  = aws_cloudwatch_log_group.lambda[each.key].name
    log_format = "Text"
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.lambda_configs

  name              = "/aws/lambda/${local.name_prefix}-${each.value.function_name_suffix}"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_metric_filter" "operational" {
  for_each = {
    for key, alarm in local.operational_metric_alarms : key => alarm
    if alarm.enabled
  }

  name           = "${local.name_prefix}-${each.value.alarm_suffix}"
  log_group_name = aws_cloudwatch_log_group.lambda[each.value.lambda_key].name
  pattern        = each.value.filter_pattern

  metric_transformation {
    name      = each.value.metric_name
    namespace = local.metric_namespace
    value     = "$.values.count"
  }
}

resource "aws_cloudwatch_metric_alarm" "operational" {
  for_each = local.enabled_operational_metric_alarms

  alarm_name          = "${local.name_prefix}-${each.value.alarm_suffix}"
  alarm_description   = each.value.alarm_description
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = each.value.evaluation_periods
  datapoints_to_alarm = each.value.datapoints_to_alarm
  metric_name         = aws_cloudwatch_log_metric_filter.operational[each.key].metric_transformation[0].name
  namespace           = local.metric_namespace
  period              = each.value.period
  statistic           = "Sum"
  threshold           = each.value.threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_notification_topic_arns
  ok_actions          = var.alarm_notification_topic_arns
  tags                = local.common_tags
}

resource "aws_cloudwatch_dashboard" "operational" {
  dashboard_name = "${local.name_prefix}-operational"
  dashboard_body = jsonencode({
    widgets = local.operational_dashboard_widgets
  })
}

resource "aws_cloudwatch_query_definition" "observability" {
  for_each = local.observability_query_definitions

  name            = each.value.name
  log_group_names = [for key, group in aws_cloudwatch_log_group.lambda : group.name]
  query_string    = trimspace(each.value.query_string)
}

resource "aws_cloudwatch_event_rule" "everbridge_active_poll" {
  name                = "${local.name_prefix}-everbridge-active-poll"
  schedule_expression = "rate(5 minutes)"
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "everbridge_active_poll" {
  rule = aws_cloudwatch_event_rule.everbridge_active_poll.name
  arn  = aws_lambda_function.service["everbridge_poller"].arn

  input = jsonencode({
    mode          = "active"
    windowMinutes = 5
  })
}

resource "aws_lambda_permission" "allow_eventbridge_everbridge_poller" {
  statement_id  = "AllowExecutionFromEventBridgeEverbridgePoll"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.service["everbridge_poller"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.everbridge_active_poll.arn
}

resource "aws_cloudwatch_event_rule" "hazard_feed_poll" {
  name                = "${local.name_prefix}-hazard-feed-poll"
  schedule_expression = "rate(15 minutes)"
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "hazard_feed_poll" {
  rule = aws_cloudwatch_event_rule.hazard_feed_poll.name
  arn  = aws_lambda_function.service["hazard_feed_poller"].arn

  input = jsonencode({
    feedName = "pilot-hazard-feed"
  })
}

resource "aws_lambda_permission" "allow_eventbridge_hazard_feed_poller" {
  statement_id  = "AllowExecutionFromEventBridgeHazardFeedPoll"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.service["hazard_feed_poller"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.hazard_feed_poll.arn
}

resource "aws_apigatewayv2_api" "webhooks" {
  name          = "${local.name_prefix}-webhooks"
  protocol_type = "HTTP"
  tags          = local.common_tags
}

resource "aws_apigatewayv2_integration" "arcgis" {
  api_id                 = aws_apigatewayv2_api.webhooks.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.service["arcgis_webhook"].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "arcgis" {
  api_id    = aws_apigatewayv2_api.webhooks.id
  route_key = "POST /webhooks/arcgis/sitrep"
  target    = "integrations/${aws_apigatewayv2_integration.arcgis.id}"
}

resource "aws_apigatewayv2_integration" "everbridge" {
  api_id                 = aws_apigatewayv2_api.webhooks.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.service["everbridge_callback"].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "everbridge" {
  api_id    = aws_apigatewayv2_api.webhooks.id
  route_key = "POST /webhooks/everbridge/notification"
  target    = "integrations/${aws_apigatewayv2_integration.everbridge.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.webhooks.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      sourceIp       = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
    })
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.name_prefix}-webhooks"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_lambda_permission" "allow_api_gateway_arcgis" {
  statement_id  = "AllowExecutionFromApiGatewayArcgis"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.service["arcgis_webhook"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhooks.execution_arn}/*/*"
}

resource "aws_lambda_permission" "allow_api_gateway_everbridge" {
  statement_id  = "AllowExecutionFromApiGatewayEverbridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.service["everbridge_callback"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhooks.execution_arn}/*/*"
}
