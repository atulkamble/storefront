pipeline {
    agent any

    environment {
        IMAGE      = 'docker.io/atuljkamble/storefront:latest'
        AWS_REGION = 'us-east-1'
        EKS_CLUSTER = 'mycluster'
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/atulkamble/storefront.git'
            }
        }

        stage('Docker Build') {
            steps {
                script {
                    docker.build(env.IMAGE)
                }
            }
        }

        stage('Docker Push') {
            steps {
                script {
                    docker.withRegistry(
                        'https://index.docker.io/v1/',
                        'dockerhub-credentials'
                    ) {
                        docker.image(env.IMAGE).push()
                    }
                }
            }
        }

        stage('Configure EKS Access') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws'
                ]]) {
                    sh '''
                        aws eks update-kubeconfig \
                            --name "$EKS_CLUSTER" \
                            --region "$AWS_REGION"
                    '''
                }
            }
        }

        stage ('Install kubectl') {
            steps {
                sh 'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"'
                sh 'chmod +x kubectl'
                sh 'mv kubectl /usr/local/bin/'
                sh 'kubectl version --client'
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh 'kubectl apply -f k8s/'
            }
        }
    }
}