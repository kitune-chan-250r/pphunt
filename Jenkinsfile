pipeline {
  agent any

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build') {
      agent {
        docker {
          image 'mcr.microsoft.com/devcontainers/typescript-node:5-26-bookworm'
          reuseNode true
        }
      }

      steps {
        sh '''
          set -eu

          rm -rf node_modules

          npm cache clean --force

          npm ci
          
          npm run build
        '''

        archiveArtifacts artifacts: 'dist/**', fingerprint: true
      }
    }
  }
}