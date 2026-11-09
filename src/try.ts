// #51 leaf 4: the "it's fine" ending of /kagami:try. CC sorts the try answer into three. This only decides whether to tag and the Release description
// Before v1.0.0, close only the branch, with no tag and no Release (AGENTS.md "Trying a branch")
// Contract: contracts/51/try.contract.ts, contracts/52/try.contract.ts, contracts/126/main.contract.ts

// version is plugin.json version. titles are the PR titles of that branch's leaves (merge order)
// tag: the tag to put (`v<version>`). None below 1.0.0. notes: the Release description, one "- <title>" line per title
// prerelease: the version has a SemVer pre-release tail (1.0.0-beta.1) → the Release is marked Pre-release (#52)
// main: a plain release (1.0.0 or above, no tail) → move main to the tag commit. A beta does not move it (#134)
export function finish(
	version: string,
	titles: string[],
): { tag?: string; notes: string; prerelease: boolean; main: boolean } {
	const notes = titles.map((t) => `- ${t}`).join("\n");
	const prerelease = version.split("+")[0].includes("-");
	if (Number.parseInt(version, 10) < 1)
		return { notes, prerelease, main: false };
	return { tag: `v${version}`, notes, prerelease, main: !prerelease };
}

// node src/try.ts <version> [leaf PR title...] → {tag?, notes, prerelease, main} JSON
if (import.meta.main) {
	const [version, ...titles] = process.argv.slice(2);
	if (!version) throw new Error("Usage: node src/try.ts <version> [title...]");
	console.log(JSON.stringify(finish(version, titles)));
}
