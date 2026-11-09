// #155 leaf #156: shows the tree on the GitHub Project boards linked to the target repo. The board is not written in the repo:
// it is whatever board the repo is linked to (repository.projectsV2). sync adds missing issues and sets Status
// Contract: contracts/155/board.contract.ts
import type { Run } from "./run.ts";

export type Board = { owner: string; number: number };
export type Issue = {
	number: number;
	state: "open" | "closed";
	assignees: string[];
};

// Boards linked to repo (owner/name). [] if none
export async function linked(_repo: string, _run: Run): Promise<Board[]> {
	throw new Error("not implemented");
}

// On every linked board: adds the issues that are not on it, and sets Status where it differs
// (closed → Done, open and assigned → In Progress, open and unassigned → Todo). Leaves other repos' items alone.
// No linked board → { added: [], moved: [] }. Rejects without the project scope, with a message that says `gh auth refresh -s project`
export async function sync(
	_repo: string,
	_issues: Issue[],
	_run: Run,
): Promise<{ added: number[]; moved: number[] }> {
	throw new Error("not implemented");
}
