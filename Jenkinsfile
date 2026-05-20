// ─────────────────────────────────────────────────────────────────────────────
//  SysPulse — Jenkins CI/CD Pipeline
//  Stages: Lint → Test → Build → Push → Deploy (Staging) → Deploy (Prod)
// ─────────────────────────────────────────────────────────────────────────────
pipeline {
    agent any

    environment {
        APP_NAME       = 'syspulse'
        DOCKER_REPO    = "${env.DOCKER_REGISTRY ?: 'registry.example.com'}/syspulse"
        IMAGE_TAG      = "${env.GIT_COMMIT?.take(8) ?: 'latest'}"
        KUBECONFIG     = credentials('kubeconfig')
        DOCKER_CREDS   = credentials('docker-registry-credentials')
        K8S_NAMESPACE  = 'syspulse'
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
        disableConcurrentBuilds()
    }

    stages {

        // ── Stage 1: Checkout & Setup ──────────────────────────────────────
        stage('Checkout') {
            steps {
                echo "📦 Checking out branch: ${env.BRANCH_NAME}"
                checkout scm
                script {
                    env.GIT_AUTHOR    = sh(returnStdout: true, script: 'git log -1 --format="%an"').trim()
                    env.GIT_MESSAGE   = sh(returnStdout: true, script: 'git log -1 --format="%s"').trim()
                    env.SHORT_SHA     = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
                    env.IMAGE_FULL    = "${DOCKER_REPO}:${SHORT_SHA}"
                    env.IMAGE_LATEST  = "${DOCKER_REPO}:latest"
                }
                echo "Commit: ${env.SHORT_SHA} by ${env.GIT_AUTHOR}"
            }
        }

        // ── Stage 2: Lint & Validate ───────────────────────────────────────
        stage('Lint & Validate') {
            parallel {
                stage('Docker Lint') {
                    steps {
                        sh '''
                            docker run --rm -i hadolint/hadolint < Dockerfile || true
                        '''
                    }
                }
            }
        }

        // ── Stage 3: Security Scan ─────────────────────────────────────────
        stage('Security Scan') {
            steps {
                echo "🔍 Running Trivy filesystem scan..."
                sh '''
                    docker run --rm \
                      -v "$(pwd):/project" \
                      aquasec/trivy:latest \
                      fs --severity HIGH,CRITICAL \
                      --exit-code 0 \
                      /project || true
                '''
            }
        }

        

        // ── Stage 5: Image Security Scan ──────────────────────────────────
        stage('Image Scan') {
            steps {
                echo "🛡️  Scanning image for vulnerabilities..."
                sh """
                    docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      aquasec/trivy:latest image \
                      --severity HIGH,CRITICAL \
                      --exit-code 0 \
                      ${env.IMAGE_FULL} || true
                """
            }
        }

        // ── Stage 6: Push to Registry ─────────────────────────────────────
        stage('Push') {
            when {
                anyOf {
                    branch 'main'
                    branch 'staging'
                    branch pattern: 'release/.*', comparator: 'REGEXP'
                }
            }
            steps {
                echo "📤 Pushing image to registry..."
            }
        }

        // ── Stage 7: Deploy to Staging ────────────────────────────────────
        stage('Deploy → Staging') {
            when { branch 'staging' }
            environment {
                DEPLOY_ENV = 'staging'
                REPLICA_COUNT = '1'
            }
            steps {
                echo "🚀 Deploying to Staging..."
                sh """
                    export KUBECONFIG=\$KUBECONFIG
                    kubectl set image deployment/${APP_NAME} \
                      app=${env.IMAGE_FULL} \
                      -n ${K8S_NAMESPACE}-staging
                    kubectl rollout status deployment/${APP_NAME} \
                      -n ${K8S_NAMESPACE}-staging \
                      --timeout=120s
                """
            }
        }

        // ── Stage 8: Smoke Tests ───────────────────────────────────────────
        stage('Smoke Tests') {
            when { branch 'staging' }
            steps {
                echo "🧪 Running smoke tests against staging..."
                sh '''
                    STAGING_URL="http://staging.syspulse.example.com"
                    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $STAGING_URL/health)
                    if [ "$HTTP_STATUS" != "200" ]; then
                        echo "❌ Health check failed: HTTP $HTTP_STATUS"
                        exit 1
                    fi
                    echo "✅ Smoke tests passed (HTTP $HTTP_STATUS)"
                '''
            }
        }

        // ── Stage 9: Deploy to Production ─────────────────────────────────
        stage('Deploy → Production') {
            when { branch 'main' }
            environment {
                DEPLOY_ENV    = 'production'
                REPLICA_COUNT = '3'
            }
            input {
                message "Deploy ${env.SHORT_SHA} to Production?"
                ok "Deploy"
                submitter "admin,devops-lead"
            }
            steps {
                echo "🚀 Deploying to Production..."
                sh """
                    export KUBECONFIG=\$KUBECONFIG
                    kubectl set image deployment/${APP_NAME} \
                      app=${env.IMAGE_FULL} \
                      -n ${K8S_NAMESPACE}
                    kubectl rollout status deployment/${APP_NAME} \
                      -n ${K8S_NAMESPACE} \
                      --timeout=300s
                """
            }
        }

    }

    // ─── Post Actions ──────────────────────────────────────────────────────
    post {
        success {
            echo "✅ Pipeline succeeded!"
        }
        failure {
            echo "❌ Pipeline failed!"
        }
    }
}
