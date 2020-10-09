const util = require('util');
const fs = require('fs').promises;
const tmp = require('tmp-promise');
const childProcess = require('child_process');
const fetch = require('node-fetch');
const YAML = require('yaml');
const { Downloader } = require('github-download-directory');
const config = require('../../../config');
const logger = require('../../../utils/logging');

const constructChartValues = async (service) => {
  const { workQueueName } = service;
  const { experimentId } = service.workRequest;
  const { clusterEnv } = config;

  const response = await fetch(
    config.workerInstanceConfigUrl,
    {
      method: 'GET',
    },
  );

  return response.text().then((txt) => {
    const cfg = YAML.parse(txt);

    return {
      ...cfg,
      experimentId,
      clusterEnv,
      workQueueName,
      storageSize: '10Gi',
    };
  });
};

const createWorkerResources = async (service) => {
  const { workerHash } = service;
  const HELM_BINARY = '/usr/local/bin/helm';

  // Download value template from Git repository. Fill in needed things.
  const execFile = util.promisify(childProcess.execFile);
  const instanceConfig = await constructChartValues(service);
  const { name } = tmp.fileSync();
  await fs.writeFile(name, YAML.stringify(instanceConfig));

  // Download the chart from the worker repository.
  const custom = new Downloader({
    github: { auth: '64ed5ec7a15c641069525e5c43464ead8bbdc20b' },
  });
  await custom.download('biomage-ltd', 'worker', 'chart-instance');


  // Attempt to deploy the worker.
  try {
    const params = `upgrade worker-${workerHash} chart-instance/ --namespace ${instanceConfig.namespace} -f ${name} --install --wait -o json`.split(' ');

    let { stdout: release } = await execFile(HELM_BINARY, params);
    release = JSON.parse(release);

    logger.log(`Release ${release.name} successfully created.`);
  } catch (error) {
    if (!error.stderr || !error.stderr.includes('release: already exists')) {
      throw error;
    }

    logger.log('Release is being created by another process, skipping...');
  }
};

module.exports = createWorkerResources;
