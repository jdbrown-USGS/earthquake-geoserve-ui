#!/usr/bin/env groovy

node {
  // Used for consistency between other variables
  def APP_NAME = 'earthquake-geoserve-ui'
  // Base group from where general images may be pulled
  def DEVOPS_REGISTRY = "${REGISTRY_HOST}/devops/containers"
  // Flag to capture exceptions and mark build as failure
  def FAILURE = null
  // Set by "checkout" step below
  def SCM_VARS = [:]


  // Name of image to use as basis when building LOCAL_IMAGE/DEPLOY_IMAGE
  def BASE_IMAGE = "${DEVOPS_REGISTRY}/nginx:latest"

  // Used to install dependencies and build distributables
  def BUILDER_IMAGE = "${DEVOPS_REGISTRY}/node:8"
  def BUILDER_CONTAINER = "${APP_NAME}-${BUILD_ID}-BUILDER"

  // Name of image to deploy (push) to registry
  def DEPLOY_IMAGE = "${REGISTRY_HOST}/ghsc/hazdev/earthquake-geosurve/ui"

  // Image of application created locally prior to tagging for publication.
  // Used to start PENTEST_CONTAINER for security testing
  def LOCAL_IMAGE = "local/${APP_NAME}:${BUILD_ID}"

  // Runs zap.sh as daemon and used to execute zap-cli calls within
  def OWASP_IMAGE = "${DEVOPS_REGISTRY}/library/owasp/zap2docker-stable"
  def OWASP_CONTAINER = "${APP_NAME}-${BUILD_ID}-OWASP"

  // Run application for testing security vulnerabilities
  def PENTEST_CONTAINER = "${APP_NAME}-${BUILD_ID}-PENTEST"

  // Used to run linting, unit tests, coverage, and e2e within this container
  def TESTER_IMAGE = "${DEVOPS_REGISTRY}/library/trion/ng-cli-e2e"
  def TESTER_CONTAINER = "${APP_NAME}-${BUILD_ID}-TESTER"


  try {
    stage('Update') {
      // Start from scratch
      cleanWs()

      // Sets ...
      //   SCM_VARS.GIT_BRANCH (e.g. origin/master)
      //   SCM_VARS.GIT_COMMIT
      //   SCM_VARS.GIT_PREVIOUS_COMMIT
      //   SCM_VARS.GIT_PREVIOUS_SUCCESSFUL_COMMIT
      //   SCM_VARS.GIT_URL
      SCM_VARS = checkout scm

      if (GIT_BRANCH != '') {
        // Check out the specified branch
        sh "git checkout --detach ${GIT_BRANCH}"

        // Update relevant SCM_VARS
        SCM_VARS.GIT_BRANCH = GIT_BRANCH
        SCM_VARS.GIT_COMMIT = sh(
          returnStdout: true,
          script: "git rev-parse HEAD"
        )
      }
    }

    stage('Dependencies') {
      docker.image(BUILDER_IMAGE).inside() {
        // Create dependencies
        withEnv([
          'npm_config_cache=/tmp/npm-cache',
          'HOME=/tmp'
        ]) {
          ansiColor('xterm') {
            sh """
              source /etc/profile.d/nvm.sh > /dev/null 2>&1
              npm config set package-lock false

              # Using --production installs dependencies but not devDependencies
              npm install --production
            """
          }
        }

        // Analyze dependencies
        ansiColor('xterm') {
          dependencyCheckAnalyzer(
            datadir: '',
            hintsFile: '',
            includeCsvReports: false,
            includeHtmlReports: false,
            includeJsonReports: false,
            includeVulnReports: false,
            isAutoupdateDisabled: false,
            outdir: '',
            scanpath: 'node_modules',
            skipOnScmChange: false,
            skipOnUpstreamChange: false,
            suppressionFile: '',
            zipExtensions: ''
          )
        }

        // Publish results
        dependencyCheckPublisher(
          canComputeNew: false,
          defaultEncoding: '',
          healthy: '',
          pattern: '**/dependency-check-report.xml',
          unHealthy: ''
        )
      }
    }

    stage('Image') {
      // Install all dependencies so
      docker.image(BUILDER_IMAGE).inside() {
        withEnv([
          'npm_config_cache=/tmp/npm-cache',
          'HOME=/tmp'
        ]) {
          sh """
            source /etc/profile.d/nvm.sh > /dev/null 2>&1
            npm config set package-lock false

            npm install --no-save
            npm run build -- --prod --progress false
          """
        }
      }

      // Build candidate image for later penetration testing
      sh """
        docker pull ${BASE_IMAGE}
        docker build \
          --build-arg BASE_IMAGE=${BASE_IMAGE} \
          -t ${LOCAL_IMAGE} \
          .
      """
    }

    stage('Unit Tests') {
      // Note that running angular tests destroys the "dist" folder that was
      // originally created in Install stage. This is not needed later, so
      // okay, but just be aware ...

      // Run linting, unit tests, and end-to-end tests
      docker.image(TESTER_IMAGE).inside () {
        ansiColor('xterm') {
          sh """
            ng lint
            ng test --single-run --code-coverage --progress false
            ng e2e --progress false
          """
        }
      }

      // Publish results
      cobertura(
        autoUpdateHealth: false,
        autoUpdateStability: false,
        coberturaReportFile: '**/cobertura-coverage.xml',
        conditionalCoverageTargets: '70, 0, 0',
        failUnhealthy: false,
        failUnstable: false,
        lineCoverageTargets: '80, 0, 0',
        maxNumberOfBuilds: 0,
        methodCoverageTargets: '80, 0, 0',
        onlyStable: false,
        sourceEncoding: 'ASCII',
        zoomCoverageChart: false
      )
    }

    stage('Penetration Tests') {
      def ZAP_API_PORT = '8090'
      def OWASP_REPORT_DIR = "${WORKSPACE}/owasp-data"


      // Ensure report output directory exists
      sh """
        if [ ! -d "${OWASP_REPORT_DIR}" ]; then
          mkdir -p ${OWASP_REPORT_DIR}
          chmod 777 ${OWASP_REPORT_DIR}
        fi
      """

      // Start a container to run penetration tests against
      sh """
        docker run --rm --name ${PENTEST_CONTAINER} \
          -d ${LOCAL_IMAGE}
      """

      // Start a container to execute OWASP PENTEST
      sh """
        docker run --rm -d -u zap \
          --name=${OWASP_CONTAINER} \
          --link=${PENTEST_CONTAINER} \
          -v ${OWASP_REPORT_DIR}:/zap/reports:rw \
          -i ${OWASP_IMAGE} \
          zap.sh \
          -daemon \
          -port ${ZAP_API_PORT} \
          -config api.disablekey=true
      """

      // Wait for OWASP container to be ready, but not for too long
      timeout(
        time: 20,
        unit: 'SECONDS'
      ) {
        echo "Waiting for OWASP container to finish starting up"
        sh """
          set +x
          status='FAILED'
          while [ \$status != 'SUCCESS' ]; do
            sleep 1;
            status=`\
              (\
                docker exec -i ${OWASP_CONTAINER} \
                  curl -I localhost:${ZAP_API_PORT} \
                  > /dev/null 2>&1 && echo 'SUCCESS'\
              ) \
              || \
              echo 'FAILED'\
            `
          done
        """
      }

      // Run the penetration tests
      ansiColor('xterm') {
        sh """
          # Get IP of application image, OWASP hates hostnames
          PENTEST_IP=`docker inspect \
            -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
            ${PENTEST_CONTAINER} \
          `

          docker exec ${OWASP_CONTAINER} \
            zap-cli -v -p ${ZAP_API_PORT} spider \
            http://\$PENTEST_IP/

          docker exec ${OWASP_CONTAINER} \
            zap-cli -v -p ${ZAP_API_PORT} active-scan \
            http://\$PENTEST_IP/

          docker exec ${OWASP_CONTAINER} \
            zap-cli -v -p ${ZAP_API_PORT} report \
            -o /zap/reports/owasp-zap-report.html -f html

          docker stop ${OWASP_CONTAINER} ${PENTEST_CONTAINER}
        """
      }

      // Publish results
      publishHTML (target: [
        allowMissing: true,
        alwaysLinkToLastBuild: true,
        keepAll: true,
        reportDir: OWASP_REPORT_DIR,
        reportFiles: 'owasp-zap-report.html',
        reportName: 'OWASP ZAP Report'
      ])
    }

    stage('Publish') {
      def IMAGE_VERSION = null

      // Determine image tag to use
      if (SCM_VARS.GIT_BRANCH == 'origin/master') {
        IMAGE_VERSION = 'latest'
      } else {
        IMAGE_VERSION = SCM_VARS.GIT_BRANCH.split('/').last().replace(' ', '_')
      }

      // Re-tag candidate image as actual image name and push actual image to
      // repository
      withCredentials([usernamePassword(
        credentialsId: 'gitlab-innersource-admin',
        passwordVariable: 'REGISTRY_PASS',
        usernameVariable: 'REGISTRY_USER'
      )]) {
        ansiColor('xterm') {
          sh """
            docker login ${REGISTRY_HOST} -u ${REGISTRY_USER} -p ${REGISTRY_PASS}

            docker tag \
              ${LOCAL_IMAGE} \
              ${DEPLOY_IMAGE}:${IMAGE_VERSION}

            # TODO :: Figure out why pushes are failing
            #docker push ${DEPLOY_IMAGE}:${IMAGE_VERSION}
          """
        }
      }
    }

    stage('Deploy') {
      echo 'TODO :: Call deploy pipeline'
    }
  } catch (e) {
    mail to: 'emartinez@usgs.gov',
      from: 'noreply@jenkins',
      subject: 'Jenkins: earthquake-design-ui',
      body: "Project build (${BUILD_TAG}) failed with '${e}'"


    FAILURE = e
  } finally {
    stage('Cleanup') {
      sh """
        set +x
        docker container rm --force \
          ${BUILDER_CONTAINER} \
          ${OWASP_CONTAINER} \
          ${PENTEST_CONTAINER} \
          ${TESTER_CONTAINER} \
        || echo 'No spurious containers'

        docker image rm --force ${LOCAL_IMAGE} \
          || echo 'No spurious test image'
      """

      if (FAILURE) {
        currentBuild.result = 'FAILURE'
        throw FAILURE
      }
    }

  }

}
