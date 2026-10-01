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

        stage( AWS CLI configuration') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws'
                ]]) {
                    sh '''
                        aws configure set aws_access_key_id "$AWS_ACCESS_KEY_ID"
                        aws configure set aws_secret_access_key "$AWS_SECRET_ACCESS_KEY"
                        aws configure set default.region "$AWS_REGION"
                    '''
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

        stage('Deploy to Kubernetes') {
            steps {
                sh 'kubectl apply -f k8s/'
            }
        }
    }
}