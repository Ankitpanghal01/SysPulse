// ─────────────────────────────────────────────────────────────────────────────
//  SysPulse — Terraform Infrastructure (AWS + EKS)
//  Resources: VPC · EKS · Node Groups · Security Groups · IAM
// ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.27"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }

  backend "s3" {
    bucket         = "syspulse-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "syspulse-tf-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "syspulse"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "devops"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
    token                  = data.aws_eks_cluster_auth.cluster.token
  }
}

# ─── Data Sources ──────────────────────────────────────────────────────────────
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_name
}

# ─── Local Values ─────────────────────────────────────────────────────────────
locals {
  cluster_name = "${var.project_name}-${var.environment}"
  azs          = slice(data.aws_availability_zones.available.names, 0, 3)
}

# ─── VPC ──────────────────────────────────────────────────────────────────────
module "vpc" {
  source = "./modules/vpc"

  name               = local.cluster_name
  cidr               = var.vpc_cidr
  azs                = local.azs
  private_subnets    = var.private_subnet_cidrs
  public_subnets     = var.public_subnet_cidrs
  cluster_name       = local.cluster_name
}

# ─── Security Groups ──────────────────────────────────────────────────────────
module "security_groups" {
  source = "./modules/security-groups"

  name         = local.cluster_name
  vpc_id       = module.vpc.vpc_id
  vpc_cidr     = var.vpc_cidr
}

# ─── EKS Cluster ──────────────────────────────────────────────────────────────
module "eks" {
  source = "./modules/eks"

  cluster_name    = local.cluster_name
  cluster_version = var.k8s_version
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids

  node_groups = {
    general = {
      desired_size   = var.node_desired_size
      min_size       = var.node_min_size
      max_size       = var.node_max_size
      instance_types = var.node_instance_types
      capacity_type  = "ON_DEMAND"
      disk_size      = 50

      labels = {
        role = "general"
      }
    }

    monitoring = {
      desired_size   = 2
      min_size       = 1
      max_size       = 4
      instance_types = ["t3.medium"]
      capacity_type  = "ON_DEMAND"
      disk_size      = 100

      labels = {
        role = "monitoring"
      }

      taints = [{
        key    = "dedicated"
        value  = "monitoring"
        effect = "NO_SCHEDULE"
      }]
    }
  }
}

# ─── Helm: Prometheus Stack ────────────────────────────────────────────────────
resource "helm_release" "kube_prometheus_stack" {
  name             = "prometheus-stack"
  namespace        = "monitoring"
  create_namespace = true
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "kube-prometheus-stack"
  version          = "58.0.0"

  values = [
    file("${path.module}/helm-values/prometheus-stack.yml")
  ]

  set {
    name  = "grafana.adminPassword"
    value = var.grafana_admin_password
  }

  depends_on = [module.eks]
}

# ─── ECR Repository ───────────────────────────────────────────────────────────
resource "aws_ecr_repository" "app" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 20 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

# ─── Outputs ──────────────────────────────────────────────────────────────────
output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = local.cluster_name
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.app.repository_url
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "configure_kubectl" {
  description = "Configure kubectl command"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${local.cluster_name}"
}
