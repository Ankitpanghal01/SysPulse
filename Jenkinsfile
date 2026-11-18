pipeline {
    agent any

    parameters {
        booleanParam(name: 'PUSH_IMAGE', defaultValue: false,
                     description: 'Push the image to Docker Hub (needs credential id: dockerhub-creds)')
        booleanParam(name: 'DEPLOY_K8S', defaultValue: false,
                     description: 'Deploy to Kubernetes (needs a cluster and credential id: kubeconfig)')
    }

    environment {
        APP_NAME      = 'syspulse'
        DOCKER_REPO   = 'ankitkumar2005/syspulse'
        K8S_NAMESPACE = 'syspulse'
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
        disableConcurrentBuilds()
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.SHORT_SHA    = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
                    env.IMAGE_FULL   = "${env.DOCKER_REPO}:${env.SHORT_SHA}"
                    env.IMAGE_LATEST = "${env.DOCKER_REPO}:latest"
                }
                echo "Commit: ${env.SHORT_SHA}"
            }
        }

        stage('Lint') {
            steps {
                sh 'docker run --rm -i hadolint/hadolint < Dockerfile || true'
            }
        }

        stage('Build') {
            steps {
                echo "Building ${env.IMAGE_FULL}"
                sh "docker build -t ${env.IMAGE_FULL} -t ${env.IMAGE_LATEST} ."
            }
        }

        stage('Test') {
            steps {
                sh "docker run --rm --entrypoint nginx ${env.IMAGE_FULL} -t"
                sh """
                    docker rm -f syspulse-ci-test || true
                    docker run -d --name syspulse-ci-test ${env.IMAGE_FULL}
                    sleep 3
                    docker exec syspulse-ci-test wget -q -O /dev/null http://127.0.0.1/
                """
            }
            post {
                always {
                    sh 'docker rm -f syspulse-ci-test || true'
                }
            }
        }

        stage('Image Scan') {
            steps {
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

        stage('Push') {
            when { expression { return params.PUSH_IMAGE } }
            environment {
                DOCKER_CREDS = credentials('dockerhub-creds')
            }
            steps {
                sh '''
                    echo "$DOCKER_CREDS_PSW" | docker login -u "$DOCKER_CREDS_USR" --password-stdin
                '''
                sh "docker push ${env.IMAGE_FULL}"
                sh "docker push ${env.IMAGE_LATEST}"
            }
            post {
                always {
                    sh 'docker logout || true'
                }
            }
        }

        stage('Deploy to Kubernetes') {
            when { expression { return params.DEPLOY_K8S } }
            steps {
                withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG')]) {
                    sh """
                        kubectl set image deployment/${APP_NAME} app=${env.IMAGE_FULL} -n ${K8S_NAMESPACE}
                        kubectl rollout status deployment/${APP_NAME} -n ${K8S_NAMESPACE} --timeout=300s
                    """
                }
            }
        }
    }

    post {
        success { echo 'Pipeline succeeded' }
        failure { echo 'Pipeline failed' }
    }
}
