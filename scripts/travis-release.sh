#!/usr/bin/env bash
set -e # fail on first error
set -x
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/.." # parent dir
cd "${DIR}"

check_required_env() {
    if [[ -z "${GH_TOKEN}" ]]; then
        echo "You need to set up GH_TOKEN env. It should contain github token."
        exit 1;
    fi
}

install_tools() {
    npm install -g semver conventional-github-releaser
}

verify_node_version() {
    if [[ "$(node --version)" = "$(cat .nvmrc)"* ]]; then
        echo "Node version correct ($(node --version))"
    else 
        echo "Error: Node version does not match .nvmrc"
        exit 1
    fi
}

setup_git() {
    echo "Configuring git"
    git config --global user.email "travis@travis-ci.org"
    git config --global user.name "Travis CI"
    echo "Configuring git done"
}

select_deploy_tag() {
    echo "Determining tag"

    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    echo "Branch: ${BRANCH}"
    if [ "${BRANCH}" == "master" ]; then
        TAG="latest"
    elif [ "${BRANCH}" == "staging" ]; then
        TAG="beta"
    elif [ "${BRANCH}" == "development" ]; then
        TAG="alpha"
    else
        TAG=""
    fi

    echo "Determining tag done"
}

select_version() {
    echo "Determining version"
    NPM_NAME=$(node -e "console.log(require(\"./package.json\").name)")
    CURRENT_SEMVER_IN_PACKAGEJSON=$(node -e "console.log(require(\"./package.json\").version)")
    CURRENT_SEMVER_IN_NPM_REPO=$(npm show ${NPM_NAME} dist-tags.${TAG})

    if [ "${TAG}" == "latest" ]; then
        NEW_VERSION=${CURRENT_SEMVER_IN_PACKAGEJSON}
    elif [ "${TAG}" == "beta" ]; then
        NEW_VERSION="semver ${CURRENT_SEMVER_IN_PACKAGEJSON} --preid beta -i prerelease"
    elif [ "${TAG}" == "alpha" ]; then
        NEW_VERSION="semver ${CURRENT_SEMVER_IN_PACKAGEJSON} --preid alpha  -i prerelease"
    else
        echo "Error: Unknown tag ${TAG}"
        exit 1
    fi

    if [ "${NEW_VERSION}" == "${CURRENT_SEMVER_IN_NPM_REPO}" ]; then
        echo "Error: Version '${NEW_VERSION}'' is already published on tag '${TAG}'."
        exit 1
    fi

    echo "Determining version done"
}

update_version_in_packagejson() {
    if [ "${NEW_VERSION}" != "${CURRENT_SEMVER_IN_PACKAGEJSON}" ]; then
        echo "Updating ${NPM_NAME} to ${NEW_VERSION}"
        node -e " \
        var packageFileContents = require(\"./package.json\"); \
        packageFileContents.version = \"${NEW_VERSION}\"; \
        require('fs').writeFileSync(\"./package.json\", JSON.stringify(packageFileContents, null, 2), \"utf8\"); \
        "
        echo "Updating version succeeded"
        git add package.json
    else
        echo "No need to update version in package.json"
    fi
}

build() {
    echo "Building..."
    npm install
    git add package-lock.json
    echo "Build successful"
}

run_tests() {
    echo "Unit testing..."
    npm test
    echo "Unit testing successful"

    echo "Integration testing..."
    npm run verify
    echo "Integration testing successful"
}


generate_changelog() {
    echo "Generating changelog"
    npm run changelog
    git add CHANGELOG.md
    echo "Generating changelog correct"
}

push_to_github() {
    echo "Pushing to github"

    #§ 'REPOSITORY="' + data.config.repository.github.organization + "/" + data.repository.name + '"'
    REPOSITORY="wise-team/steem-wise-core"
    PUSH_TO_REMOTE="github-by-token"

    git commit -m "chore(release): semver ${NEW_VERSION}"
    git tag -a "v${VERSION}" -m "Steem WISE core library version ${NEW_VERSION}"

    # Push all changes
    git remote add "${PUSH_TO_REMOTE}" https://${GH_TOKEN}@github.com/${REPOSITORY}.git > /dev/null 2>&1
    git push --quiet --set-upstream "${PUSH_TO_REMOTE}"
    git push --quiet --tags --set-upstream "${PUSH_TO_REMOTE}"

    echo "Pushing to github done"
}


publish_to_npm() {
    echo "Publishing to npmjs.com registry"
    npm publish --tag $TAG
    echo "Done publishing"
}

release_on_github () {
    echo "Creating github release"
    export CONVENTIONAL_GITHUB_RELEASER_TOKEN="${GH_TOKEN}"
    conventional-github-releaser -p angular
    echo "Github release done"
}


check_required_env
install_tools
verify_node_version
setup_git
select_deploy_tag

if [ ! -z "$TAG" ]
then
    select_version
    update_version_in_packagejson
fi

build
run_tests

if [ -z "$TAG" ]
then
    echo "Not on deployment branch"
    exit 0
else
    generate_changelog
    push_to_github
    publish_to_npm
    release_on_github
fi
