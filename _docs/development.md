## Development Instructions

### Updating the Skills

The skills in the `ssw-contenthawk` folder are automatically published to the marketplace when merged to `main`. Their publication settings are defined in both the `.claude-plugin/marketplace.json` file at the root of the repo and the `.claude-plugin` folder(s) inside of `ssw-contenthawk`.


### Testing skills locally

1. Remove the skill if you have a previous version installed

```
    npx skills remove -g <skill-name> 
```

2. Install the skill locally from the `ssw-contenthawk` folder

```
    npx skills add -g ./ssw-contenthawk/skills/<skill-folder-name>
```

> Note: The skills use the latest version of the `npx` command that is published to the NPM registry. If you need to test changes to the installer script using the skill, you can temporarily modify the skill's command to point to a local file instead of the npm package. For example you would change `npx ssw-contenthawk@latest install <owner/repo>` to `pnpm dev install <owner/repo>`.


### Running the scripts locally


The scripts run by the skills can be run locally using`pnpm dev` with the command below.

`npm run dev <command> <user/repo> [<content-hawk-campaign-data>]`


#### Examples

`pnpm dev install SSWConsulting/SSW.ContentHawk`

`pnpm dev new-campaign SSWConsulting/SSW.ContentHawk`

**Note: While it's possible to run the `campaigns` command, it is difficult to format the correct arguments, it is recommended to run this command through the skill (i.e./contenthawk-manage-campaigns)**

### Updating the scripts

These skills use a set of npx scripts distributed via the `npm` marketplace. If you need to update the scripts that perform actions such as updating the web UI follow these steps:

1. Get your code changes merged to `main`, ensuring you bump the version in `package.json` using [npm version](https://docs.npmjs.com/cli/v8/commands/npm-version) with [semver](https://semver.org/).
2. Go to **Releases | Draft a new release** in GitHub, add a release tag matching the version you set in `package.json` (e.g. `v0.1.16`), and publish the release. This triggers the GitHub Action workflow that builds and publishes the package to npm. You can use the automatically generated release notes or add your own.

### Updating the distributed files

The installer will copy any files under `.github` when the installation script runs, compile the workflows, and commit the changes to the user's target repository. If you need to exempt certain files from being copied during the installation process, add them to the `INSTALL_COPY_BLACKLIST` variable in `constants.ts`.