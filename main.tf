terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {}

variable "account_id" {
  type    = string
  default = "260b77a937976718dbb6b3597530f24a"
}

variable "zone_id" {
  type    = string
  default = "6713b2520cfd94e9ca61752c13152920"
}

variable "domain" {
  type    = string
  default = "pphunt.rakas.cc"
}

locals {
  project_name                 = "pphunt"
  production_branch            = "main"
  functions_compatibility_date = "2026-11-23"
}

resource "cloudflare_pages_project" "pphunt" {
  account_id        = var.account_id
  name              = local.project_name
  production_branch = local.production_branch

  deployment_configs = {
    production = {
      compatibility_date = local.functions_compatibility_date
    }

    preview = {
      compatibility_date = local.functions_compatibility_date
    }
  }
}

resource "cloudflare_dns_record" "pphunt_pages" {
  zone_id = var.zone_id
  name    = var.domain
  type    = "CNAME"
  content = "${cloudflare_pages_project.pphunt.name}.pages.dev"
  ttl     = 1
  proxied = true
}

resource "cloudflare_pages_domain" "pphunt" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.pphunt.name
  name         = var.domain

  depends_on = [cloudflare_dns_record.pphunt_pages]
}
