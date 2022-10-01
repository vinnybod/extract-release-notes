// SPDX-License-Identifier: MIT
const core = require('@actions/core')
const fs = require('fs')
const readline = require('readline')
const esrever = require('esrever');

const encoding = 'utf8'
const eol = '\n'
const topEmptyLines = new RegExp("^([" + eol + "]*)", "m");

main().catch(err => core.setFailed(err.message))

async function main() {
    const changelogFile = core.getInput('changelog_file', {required: true})
    core.debug(`changelog-file = '${changelogFile}'`)

    const releaseNotesFile = core.getInput('release_notes_file')
    core.debug(`release-notes-file = '${releaseNotesFile}'`)

    const prerelease = core.getInput('prerelease')
    core.debug(`prerelease = '${prerelease}'`)

    let releaseNotes = ''
    if (core.getInput('last_version')) {
        core.debug(`last-version = '${core.getInput('last_version')}'`)
        let lastVersion = core.getInput('last_version')
        // remove v prefix
        lastVersion = lastVersion.replace(/^v/, '')
        releaseNotes = await extractReleaseNotesMultiple(changelogFile, null, lastVersion)
    } else if (core.getInput('earliest_version')) {
        core.debug('earliest-version = true')
        let earliestVersion = core.getInput('earliest_version')
        // remove v prefix
        earliestVersion = earliestVersion.replace(/^v/, '')
        releaseNotes = await extractReleaseNotesMultiple(changelogFile, earliestVersion)
    } else {
        releaseNotes = await extractReleaseNotes(changelogFile, prerelease)
    }
    core.debug(`release-notes = '${releaseNotes}'`)

    writeReleaseNotesFile(releaseNotesFile, releaseNotes)

    core.setOutput("release_notes", releaseNotes)
}

async function extractReleaseNotesMultiple(changelogFile, earliestVersion, lastVersion) {
    const fileStream = fs.createReadStream(changelogFile, {encoding: encoding})
    const rl = readline.createInterface({
        input: fileStream
    })
    const lines = []
    
    let earliest_release_found = false
    let start_of_releases = false
    for await (const line of rl) {
        const check_for_release_block = !!line.match("^#+ \\[[0-9]")
        if (!start_of_releases) {
            if (!check_for_release_block) {
                core.debug(`skip line: '${line}'`)
                continue
            } else {
                start_of_releases = true
            }
        }

        if (earliestVersion) {
            const earliest_release_block = !!line.match(`^#+ \\[(${earliestVersion})]`)
            if (earliest_release_block) {
                earliest_release_found = true
                core.debug(`earliest release found. exiting after this block: '${line}'`)
                lines.push(line)
            } else if (check_for_release_block && earliest_release_found) {
                core.debug(`next release found: '${line}'`)
                break
            } else {
                lines.push(line)
            }
        } else if (lastVersion) {
            const last_release_block = !!line.match(`^#+ \\[(${lastVersion})]`)
            if (last_release_block) {
                core.debug(`last release found. exiting: '${line}'`)
                break
            } else {
                lines.push(line)
            }
        }
    }

    let releaseNotes = lines.reduce((previousValue, currentValue) => previousValue + eol + currentValue)
    releaseNotes = trimEmptyLinesTop(releaseNotes)
    releaseNotes = trimEmptyLinesBottom(releaseNotes)
    return releaseNotes
}

async function extractReleaseNotes(changelogFile, prerelease) {
    const fileStream = fs.createReadStream(changelogFile, {encoding: encoding})
    const rl = readline.createInterface({
        input: fileStream
    })
    const lines = []
    let inside_release = false
    for await (const line of rl) {
        const start_of_release = (!!line.match("^#+ \\[[0-9]") || (prerelease === 'true' && !!line.match("^#+ \\[Unreleased\\]")))
        if (inside_release) {
            if (start_of_release) {
                core.debug(`next version found: '${line}'`)
                break
            } else {
                lines.push(line)
                core.debug(`add line: '${line}'`)
            }
        } else {
            if (start_of_release) {
                inside_release = true
                core.debug(`version found: '${line}'`)
            } else {
                core.debug(`skip line: '${line}'`)
            }
        }
    }
    let releaseNotes = lines.reduce((previousValue, currentValue) => previousValue + eol + currentValue)
    releaseNotes = trimEmptyLinesTop(releaseNotes)
    releaseNotes = trimEmptyLinesBottom(releaseNotes)
    return releaseNotes
}

function trimEmptyLinesTop(releaseNotes) {
    return releaseNotes.replace(topEmptyLines, '')
}

function trimEmptyLinesBottom(releaseNotes) {
    return esrever.reverse(trimEmptyLinesTop(esrever.reverse(releaseNotes)))
}

function writeReleaseNotesFile(releaseNotesFile, releaseNotes) {
    if (releaseNotesFile !== "") {
        core.debug(`writing release notes file: '${releaseNotesFile}'`)
        fs.writeFile(releaseNotesFile, releaseNotes, {encoding: encoding}, err => {
            if (err) {
                throw err
            }
        })
    }
}
