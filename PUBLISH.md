This checklist ensures a streamlined process when publishing simple-caldav:

- [ ] Bump version number in `package.json`.
- [ ] Summarize changes in README.md "Changelog" section.
- [ ] Commit as "Bump to version x"
- [ ] Create branch `version/x`
- [ ] Tag new version using `git tag` and make sure to push it to GitHub.
- [ ] Upload tag to GitHub using `git push --tags`
- [ ] Upload branch to GitHub
- [ ] Publish as npm package.
