import { Application, Context } from "probot"; // eslint-disable-line no-unused-vars

const CHECK_DESCRIPTION = "Test Description";
const CHECK_CONTEXT = "etba-app/minimum-reviews";

export = (app: Application) => {
	app.on(
		[
			"pull_request",
			"pull_request.opened",
			"pull_request.reopened",
			"pull_request.synchronize",
			"pull_request_review.submitted",
			"pull_request_review.dismissed",
		],
		async (context) => {
			//console.log(context.payload);

			const config = (await context.config("special-reviewers.yml")) as any;
			const pr = context.payload.pull_request;
			const org_name = context.payload.repository.owner.login;

			if (config) {
				let reviewed = false;

				const approvals = await getReviewsWithState(context, "approved");
				approvals.forEach((approval) => {
					if (reviewed) return;
					config.reviewers.forEach(async (required_reviewer: string) => {
						reviewed = await getMembershipInTeam(context, required_reviewer, approval.user.login);
						if (reviewed) {
							await context.github.repos.createStatus(
								context.repo({
									sha: pr.head.sha,
									state: "success",
									description: CHECK_DESCRIPTION,
									context: CHECK_CONTEXT,
								})
							);
							return;
						}
					});
				});

				if (!reviewed) {
					await context.github.repos.createStatus(
						context.repo({
							sha: pr.head.sha,
							state: "pending",
							description: CHECK_DESCRIPTION,
							context: CHECK_CONTEXT,
						})
					);
				}
			}
		}
	);

	async function getNumberOfReviewsWithState(context: Context<any>, state: string) {
		const response = await context.github.pulls.listReviews({
			owner: context.payload.repository.owner.login,
			repo: context.payload.repository.name,
			number: context.payload.pull_request.number,
		});

		// console.log("getReviewsWithState BEGIN --------------");
		// console.log(response.data);
		// console.log("getReviewsWithState END --------------");

		return response.data
			.map((review: { state: any }) => review.state)
			.filter((word: string) => word.toLowerCase() === state).length;
	}

	async function getReviewsWithState(context: Context<any>, state: string) {
		const response = await context.github.pulls.listReviews({
			owner: context.payload.repository.owner.login,
			repo: context.payload.repository.name,
			number: context.payload.pull_request.number,
		});

		return response.data.filter((review: any) => review.state.toLowerCase() === state);
	}

	/**
	 * Requires permission access:
	 * Organisation permissions -> Members -> Read-only
	 */
	async function getMembershipInTeam(context: Context<any>, team_name: string, username: string) {
		const response = await context.github.teams
			.getMembershipInOrg({
				org: context.payload.repository.owner.login,
				team_slug: team_name,
				username: username,
			})
			.then((response) => {
				if (response.status === 200) {
					if (response.data.state === "active") {
						console.log(username + " IS in the " + team_name + " team.");
						return true;
					}
				}
				console.log(username + " IS NOT in the " + team_name + " team.");
				return false;
			})
			.catch((error) => {
				console.log(username + " IS NOT in the " + team_name + " team. Error: " + error);
				return false;
			});
		return response;
	}
};
