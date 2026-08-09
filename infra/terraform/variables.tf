variable "application_name" {
  description = "Application prefix used for naming resources."
  type        = string
  default     = "sitrep-int"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "aws_region" {
  description = "AWS region for deployment."
  type        = string
  default     = "us-east-1"
}

variable "arcgis_runtime_secret_arn" {
  description = "Secrets Manager ARN for ArcGIS runtime credentials."
  type        = string
}

variable "everbridge_polling_secret_arn" {
  description = "Secrets Manager ARN for Everbridge polling credentials."
  type        = string
}

variable "everbridge_draft_secret_arn" {
  description = "Secrets Manager ARN for Everbridge draft credentials."
  type        = string
}

variable "arcgis_webhook_secret_arn" {
  description = "Secrets Manager ARN for ArcGIS webhook validation secret."
  type        = string
}

variable "everbridge_webhook_secret_arn" {
  description = "Secrets Manager ARN for Everbridge callback validation secret."
  type        = string
}

variable "lambda_source_dir" {
  description = "Path to Lambda source bundle root."
  type        = string
  default     = "../../src"
}

variable "alarm_notification_topic_arns" {
  description = "Optional SNS topic ARNs for CloudWatch alarm notifications."
  type        = list(string)
  default     = []
}

variable "operational_alarm_overrides" {
  description = "Optional per-alarm overrides for operational metric alarm enablement and thresholds."
  type = map(object({
    enabled            = optional(bool)
    threshold          = optional(number)
    period             = optional(number)
    evaluation_periods = optional(number)
    datapoints_to_alarm = optional(number)
  }))
  default = {}
}
