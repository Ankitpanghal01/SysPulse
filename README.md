# SysPulse — Full DevOps Stack

> A production-grade system monitor frontend with complete CI/CD, observability, and cloud-native infrastructure.

---

## Project Structure

```
devops-app/
├── app/                        # Frontend application
│   ├── index.html              # Single-page dashboard
│   ├── style.css               # Terminal/industrial aesthetic
│   └── app.js                  # Metrics simulation & UI logic
│
├── Dockerfile                  # Multi-stage nginx build
├── nginx.conf                  # Nginx server config with /health & /metrics
├── docker-compose.yml          # Full stack: app + Prometheus + Grafana + exporters
├── Jenkinsfile                 # CI/CD pipeline (lint→build→scan→push→deploy)
│
├── prometheus/
│   ├── prometheus.yml          # Scrape configs & alertmanager targets
│   ├── alertmanager.yml        # Alert routing & receivers
│   └── rules/
│       └── alerts.yml          # PromQL alert rules (CPU/Memory/Disk/ServiceDown)
│
├── grafana/
│   └── provisioning/
│       ├── datasources/        # Auto-provisioned Prometheus datasource
│       └── dashboards/         # Dashboard provider config
│
├── k8s/
│   ├── namespace.yml           # syspulse namespace + ConfigMap
│   ├── deployment.yml          # Deployment + Service + HPA
│   ├── ingress.yml             # ALB Ingress + NetworkPolicy + PDB + ServiceMonitor
│   └── monitoring.yml          # Prometheus + Grafana + RBAC in monitoring namespace
│
└── terraform/
    ├── main.tf                 # Root module: VPC + EKS + ECR + Helm releases
    ├── variables.tf            # All configurable inputs
    └── modules/
        ├── vpc/                # VPC, subnets, NAT GWs, route tables
        └── eks/                # EKS cluster, node groups, IAM, KMS, add-ons
```

---

## Quick Start — Docker Compose

```bash
# 1. Clone and enter the project
git clone https://github.com/your-org/syspulse.git && cd syspulse

# 2. Copy env file
cp .env.example .env   # edit GRAFANA_USER, GRAFANA_PASSWORD

# 3. Start the full stack
docker-compose up -d

# 4. Open services
open http://localhost:8080   # SysPulse App
open http://localhost:9090   # Prometheus
open http://localhost:3000   # Grafana  (admin / admin123)
open http://localhost:9100   # Node Exporter metrics
open http://localhost:8081   # cAdvisor
```

---

## CI/CD Pipeline (Jenkins)

**Prerequisites:** Jenkins with Docker, credentials configured:
- `docker-registry-credentials` — Docker registry username/password
- `kubeconfig` — kubectl config file (secret file)
- `slack-webhook-url` — Slack incoming webhook

**Pipeline stages:**
1. **Checkout** — fetches code, extracts git metadata
2. **Lint & Validate** — parallel: HTMLHint, Stylelint, ESLint, Hadolint
3. **Security Scan** — Trivy filesystem scan
4. **Build** — `docker build` with labels
5. **Image Scan** — Trivy image scan
6. **Push** — pushes to registry (main/staging/release branches only)
7. **Deploy → Staging** — `kubectl set image` + rollout wait
8. **Smoke Tests** — health check against staging URL
9. **Deploy → Production** — manual approval gate, then rolling deploy

---

## Terraform Infrastructure

```bash
cd terraform

# Initialize
terraform init

# Plan
terraform plan -var="environment=production" -var="grafana_admin_password=yourpassword"

# Apply
terraform apply -auto-approve

# Get kubeconfig
aws eks update-kubeconfig --region us-east-1 --name syspulse-production
```

**Resources created:**
- VPC with 3 public + 3 private subnets across 3 AZs
- NAT Gateways (one per AZ for HA)
- EKS 1.29 cluster with encrypted secrets (KMS)
- General node group (t3.medium, 3–6 nodes, autoscaling)
- Monitoring node group (t3.medium, 1–4 nodes, tainted for dedicated workloads)
- EKS add-ons: CoreDNS, kube-proxy, VPC CNI, EBS CSI Driver
- ECR repository with lifecycle policy (keep last 20 images)
- Helm release: kube-prometheus-stack (Prometheus + Grafana + Alertmanager)

---

## Kubernetes Deployment

```bash
# Apply all manifests
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/monitoring.yml
kubectl apply -f k8s/deployment.yml
kubectl apply -f k8s/ingress.yml

# Check rollout
kubectl rollout status deployment/syspulse -n syspulse

# Scale manually
kubectl scale deployment/syspulse --replicas=5 -n syspulse

# View HPA
kubectl get hpa -n syspulse
```

**k8s features:**
- Rolling updates with zero downtime (`maxUnavailable: 0`)
- HPA scaling 2–10 pods on CPU (70%) and Memory (80%)
- PodDisruptionBudget — minimum 1 pod always available
- NetworkPolicy — allowlist-only ingress/egress
- Topology spread across AZs
- Read-only root filesystem + dropped capabilities
- ServiceMonitor for Prometheus Operator auto-discovery
- Liveness + Readiness + Startup probes

---

## Observability Stack

| Service       | Port  | Purpose                         |
|---------------|-------|---------------------------------|
| App           | 8080  | SysPulse frontend               |
| Prometheus    | 9090  | Metrics collection & alerting   |
| Grafana       | 3000  | Dashboards & visualization      |
| Alertmanager  | 9093  | Alert routing                   |
| Node Exporter | 9100  | Host metrics                    |
| cAdvisor      | 8081  | Container metrics               |

**Alert rules included:**
- `HighCPUUsage` — CPU > 80% for 2 min
- `CriticalCPUUsage` — CPU > 95% for 1 min
- `HighMemoryUsage` — Memory > 85% for 2 min
- `ServiceDown` — target `up == 0` for 30s
- `HighDiskUsage` — disk > 80% for 5 min
- `ContainerRestarting` — frequent restarts detected

---

## Environment Variables

| Variable            | Default      | Description                   |
|---------------------|--------------|-------------------------------|
| `GRAFANA_USER`      | `admin`      | Grafana admin username        |
| `GRAFANA_PASSWORD`  | `admin123`   | Grafana admin password        |
| `DOCKER_REGISTRY`   | *(required)* | Image registry host           |

---

## License

MIT — see [LICENSE](LICENSE)
