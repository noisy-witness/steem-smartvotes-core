import * as _ from "lodash";
import { Rule } from "./Rule";
import { ValidationException } from "../validation/ValidationException";
import { ValidationContext } from "../validation/ValidationContext";
import { Promise } from "bluebird";
import { SendVoteorder } from "../protocol/SendVoteorder";
import { BlogEntry } from "../blockchain/BlogEntry";
import { Util } from "../util/util";

/**
 * This rule limits maximal or minimal weight of single vote.
 * Negative values means flag, while positive means upvote.
 */
export class FirstPostRule extends Rule {
    public rule: string = Rule.Type.FirstPost;

    public constructor(min: number, max: number) {
        super();
    }

    public type(): Rule.Type {
        return Rule.Type.FirstPost;
    }

    // TODO test
    public validate (voteorder: SendVoteorder, context: ValidationContext): Promise<void> {
        return Promise.resolve()
        .then(() => this.validateRuleObject(this))
        .then(() => context.getBlogEntries(voteorder.author, 0, 250))
        .then((entries: BlogEntry []) => {
            const oldestEntry: BlogEntry = Util.definedOrThrow(
                _.last(entries),
                new ValidationException("This author (" + voteorder.author + ") has no blog entries.")
            );
            if (oldestEntry.entry_id !== 0) throw new ValidationException("This author already has more than 250 blog entries.");
            else {
                if (oldestEntry.author !== voteorder.author || oldestEntry.permlink !== voteorder.permlink) {
                    throw new ValidationException("This is not the first post of this author");
                }
            }
        });
    }

    public validateRuleObject(unprototypedObj: any) {
    }
}
