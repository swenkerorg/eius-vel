#!/usr/bin/env node
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { default: axios } = require('axios');

const GITHUB_TOKEN = argv.github;
const OWNER_NAME = argv.owner;
const CURRENT_REPO = argv.repo;
const REPO_URL = argv.repourl;
const PACKAGE_NAME = argv.package;

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * @template T
 * @param {Array<T>} arr
 * @returns {Array<T>}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

async function getListPackageByKeywords(keyword) {
  const x = await axios.get('https://registry.npmjs.org/-/v1/search', {
    responseType: 'json',
    params: {
      text: `keywords:${keyword} not:insecure,unstable`,
      quality: '0.8',
      popularity: '0.8',
    },
  });

  return x.data.objects;
}

async function getPackageInfo(packageName) {
  try {
    const x = await axios.get(`https://registry.npmjs.org/${packageName}`, {
      responseType: 'json',
    });
    return x.data;
  } catch (err) {
    return null;
  }
}

const PARENT_FOLDER = path.resolve(__dirname, '../..');
const ROOT_FOLDER = path.resolve(PARENT_FOLDER, '..');

console.log('ROOT_FOLDER=%s', ROOT_FOLDER);
console.log('PARENT_FOLDER=%s', PARENT_FOLDER);

const SKIP_MAP = {};

async function chooseFromList(list, keywords = []) {
  for (const pkg of list) {
    if (
      !pkg.package.links ||
      !pkg.package.links.repository ||
      !pkg.package.links.repository.startsWith('https://github.com/')
    ) {
      continue;
    }

    const url = pkg.package.links.repository;
    const packageName = pkg.package.name;

    try {
      const fullPackageInfo = await getPackageInfo(packageName);

      const versions = Object.values(fullPackageInfo.versions || {});

      if (
        versions &&
        versions[0] &&
        versions[0].dependencies &&
        versions[0].dependencies['node-gyp-build']
      ) {
        console.log(
          'Skip package %s due to the need of node-gyp-build',
          packageName
        );
        continue;
      }

      console.log('Try to clone package %s, url: %s', packageName, url);

      // clone to test-folder
      const folder = path.join(ROOT_FOLDER, Math.random().toString());

      console.log('Try to clone to folder %s', folder);

      child_process.execSync(`git clone "${url}" "${folder}"`, {
        cwd: ROOT_FOLDER,
      });

      //copy readme file only
      fs.readdirSync(folder).forEach((file) => {
        if (/readme\.md/i.test(file)) {
          try {
            fs.unlinkSync(path.join(PARENT_FOLDER, file));
            fs.copyFileSync(
              path.join(folder, file),
              path.join(PARENT_FOLDER, file)
            );
          } catch (err) {
            console.log(err);
          }
        }
      });

      console.log('Copied data');

      child_process.execSync(`rm -rf "${folder}"`);

      const ORI_PACKAGE_JSON = JSON.parse(
        fs.readFileSync(path.join(PARENT_FOLDER, 'package.json'), {
          encoding: 'utf-8',
        })
      );

      console.log('Original PACKAGE_JSON', ORI_PACKAGE_JSON);

      ORI_PACKAGE_JSON.dependencies = ORI_PACKAGE_JSON.dependencies || {};

      //
      const { data: repos } = await axios.get(
        `https://api.github.com/orgs/${OWNER_NAME}/repos`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
          },
          responseType: 'json',
        }
      );

      for (const repo of repos) {
        if (repo.full_name === CURRENT_REPO) {
          console.log('Skip repo %s due to current repo', repo.full_name);
          continue;
        }

        if (SKIP_MAP[repo.full_name]) {
          console.log('Skip repo %s due to skip map', repo.full_name);
          continue;
        }

        try {
          const { data: packageJSON } = await axios.get(
            `https://raw.githubusercontent.com/${repo.full_name}/main/package.json`,
            {
              headers: {
                Authorization: `Bearer ${GITHUB_TOKEN}`,
              },
              responseType: 'json',
            }
          );

          if (SKIP_MAP[packageJSON.name]) {
            console.log('Skip repo %s due to skip map', repo.full_name);
            SKIP_MAP[repo.full_name] = true;
            continue;
          }

          if (packageJSON.name.includes('test')) {
            console.log('Skip repo %s due to test package', repo.full_name);
            SKIP_MAP[packageJSON.name] = true;
            SKIP_MAP[repo.full_name] = true;
            continue;
          }

          const info = await getPackageInfo(packageJSON.name);

          if (!info) {
            console.log(
              'Skip repo %s due to not found package %s',
              repo.full_name,
              packageJSON.name
            );
            SKIP_MAP[packageJSON.name] = true;
            SKIP_MAP[repo.full_name] = true;
            continue;
          }

          ORI_PACKAGE_JSON.dependencies[packageJSON.name] =
            '^' + packageJSON.version;
        } catch (err) {
          console.error('Skip repo %s due to error: ', repo.full_name, err);
        }
      }

      //remove unnecessary info
      const remove = [
        'funding',
        'contributors',
        'authors',
        'donors',
        'maintainers',
        'sponsors',
        'bugs',
        'homepage',
        'repository',
      ];

      for (const key of remove) {
        if (ORI_PACKAGE_JSON[key]) {
          delete ORI_PACKAGE_JSON[key];
        }
      }

      // dont run any scripts
      ORI_PACKAGE_JSON.scripts = {};

      if (Array.isArray(keywords) && keywords.length > 0) {
        ORI_PACKAGE_JSON.keywords = keywords;
      }

      //write back
      fs.writeFileSync(
        path.join(PARENT_FOLDER, 'package.json'),
        JSON.stringify(ORI_PACKAGE_JSON, null, 2)
      );

      // find readme file
      const readmefile = fs
        .readdirSync(PARENT_FOLDER)
        .filter((file) => /^readme(\.md)?$/i.test(file));

      if (readmefile.length > 1) {
        // remove the default
        fs.unlinkSync(path.join(PARENT_FOLDER, 'README.md'));
      }

      const packageRepo = new URL(url).pathname.replace(/^\/|\/$/g, '');

      for (const file of readmefile) {
        const readmePath = path.join(PARENT_FOLDER, file);

        if (fs.existsSync(readmePath)) {
          let content = fs.readFileSync(readmePath, { encoding: 'utf-8' });
          content = content.replaceAll(url, REPO_URL);
          content = content.replaceAll(packageName, PACKAGE_NAME);
          content = content.replaceAll(packageRepo, CURRENT_REPO);
          fs.writeFileSync(readmePath, content);
        }
      }

      console.log('Done!');

      return true;
    } catch (err) {
      console.log('Skip package %s due to error: ', packageName, err);
      continue;
    }
  }

  return false;
}

async function main() {
  // latested packages from NPM
  const res = await axios.get(`https://registry.npmjs.org/-/v1/search`, {
    params: {
      text: 'not:insecure,unstable',
      size: '200',
    },
    responseType: 'json',
  });

  const packages = res.data.objects;

  shuffle(packages);
  console.log('Found packages', packages.length);

  // get list of keywords
  const keywords = new Set();

  for (const package of packages) {
    /**
     * @type {string[]}
     */
    const kw = package.package.keywords || [];
    kw.forEach((k) => keywords.add(k));
  }

  // get random keywords
  const shouldGet = random(1, keywords.size);

  const shouldSaveKeywords = shuffle([...keywords]).slice(0, shouldGet);

  for (const package of packages) {
    const packageName = package.package.name;
    const keywords = package.package.keywords || [];

    console.log('Try to get keywords for package %s', packageName);

    if (!keywords || keywords.length === 0) {
      console.log(
        'No keywords for package %s. So we choose this package',
        packageName
      );

      try {
        if (!(await chooseFromList([package]))) {
          continue;
        }
      } catch (err) {
        console.log('Skip package %s due to error: ', packageName, err);
        continue;
      }
    }

    shuffle(keywords);

    console.log('Keywords for package %s: ', packageName, keywords);

    for (const keyword of keywords) {
      const list = await getListPackageByKeywords(keyword);
      if (list.length === 0) {
        continue;
      }

      shuffle(list);

      if (await chooseFromList(list, shouldSaveKeywords)) {
        return true;
      }
    }
  }
}

main();
