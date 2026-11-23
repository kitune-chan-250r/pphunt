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

      environment {
        CLOUDFLARE_ACCOUNT_ID = '260b77a937976718dbb6b3597530f24a'
      }

      steps {
        sh '''
          set -eu

          echo "=== Execution identity ==="
          id

          echo "=== Original environment ==="
          echo "HOME=${HOME:-<unset>}"
          npm config get cache

          # ホームとnpmキャッシュをワークスペース配下に統一
          export HOME="$WORKSPACE/.home"
          export NPM_CONFIG_CACHE="$WORKSPACE/.npm-cache"

          mkdir -p "$HOME" "$NPM_CONFIG_CACHE"

          echo "=== Effective npm cache ==="
          npm config get cache

          npm ci
          npm run build
        '''

        archiveArtifacts artifacts: 'dist/**', fingerprint: true
      }
    }

    stage('Playwright Test') {
      agent {
        docker {
            image 'mcr.microsoft.com/playwright:v1.65.1-noble'
            reuseNode true
            args '--ipc=host'
        }
      }
      
      steps {
        sh '''
          set -eu

          echo "=== Execution identity ==="
          id

          echo "=== Original environment ==="
          echo "HOME=${HOME:-<unset>}"
          npm config get cache

          # ホームとnpmキャッシュをワークスペース配下に統一
          export HOME="$WORKSPACE/.home"
          export NPM_CONFIG_CACHE="$WORKSPACE/.npm-cache"

          mkdir -p "$HOME" "$NPM_CONFIG_CACHE"

          echo "=== Effective npm cache ==="
          npm config get cache

          npm ci

          npx playwright install 

          npm run test:e2e
        '''
      }
      
      post {
        always {
          archiveArtifacts artifacts: 'playwright-report/**, test-results/**', allowEmptyArchive: true
        }
      }
    }

    stage('Deploy') {
      when {
        expression {
          env.BRANCH_NAME == 'main' ||
          env.GIT_BRANCH == 'main' ||
          env.GIT_BRANCH == 'origin/main'
        }
      }

      agent {
        docker {
          image 'mcr.microsoft.com/devcontainers/typescript-node:5-26-bookworm'
          reuseNode true
        }
      }

      steps {
        withCredentials([string(credentialsId: 'cloudflare-api-token', variable: 'CLOUDFLARE_API_TOKEN')]) {
          sh '''
            set -eu

            npx wrangler pages deploy dist \
              --project-name=pphunt \
              --branch=main
          '''
        }
      }
    }
  }
}