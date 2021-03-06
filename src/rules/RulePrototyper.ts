import * as _ from "lodash";

import { Rule } from "./Rule";
import { TagsRule } from "./TagsRule";
import { AuthorsRule } from "./AuthorsRule";
import { WeightRule } from "./WeightRule";
import { CustomRPCRule } from "./CustomRPCRule";
import { ValidationException } from "../validation/ValidationException";
import { VotingPowerRule } from "./VotingPowerRule";
import { WeightForPeriodRule } from "./WeightForPeriodRule";
import { VotesCountRule } from "./VotesCountRule";
import { AgeOfPostRule } from "./AgeOfPostRule";
import { FirstPostRule } from "./FirstPostRule";
import { PayoutRule } from "./PayoutRule";
import { VotersRule } from "./VotersRule";
import { ExpirationDateRule } from "./ExpirationDateRule";
import { Ruleset } from "../protocol/Ruleset";

/**
 * This is a rule prototyper. Prototyping is done when rules are loaded from json file.
 */
export class RulePrototyper {
    /**
     * Prototypes and validates a ruleset. This function converts a plain json rules (without methods) to
     * proper Rule objects that implements all needed methods. It also validates each rule object (checks if
     * it contains all required parameters).
     * @param unprototypedRuleset - ruleset to prototype
     */
    public static prototypeRuleset(unprototypedRuleset: Ruleset): Ruleset {
        const out: Ruleset = {
            name: unprototypedRuleset.name,
            rules: unprototypedRuleset.rules.map(rule => RulePrototyper.fromUnprototypedRule(rule)),
        };
        return out;
    }

    public static fromUnprototypedRule(unprototyped: Rule): Rule {
        /* if rule implements validate, it means that it already had prototype */
        if (unprototyped.validate) return unprototyped;
        /* otherwise we have to append a prototype */ else if (unprototyped.rule === Rule.Type.Tags) {
            return RulePrototyper.prototypeRule(new TagsRule(TagsRule.Mode.ALLOW, []), unprototyped);
        } else if (unprototyped.rule === Rule.Type.Authors) {
            return RulePrototyper.prototypeRule(new AuthorsRule(AuthorsRule.Mode.ALLOW, []), unprototyped);
        } else if (unprototyped.rule === Rule.Type.Weight) {
            return RulePrototyper.prototypeRule(new WeightRule(0, 0), unprototyped);
        } else if (unprototyped.rule === Rule.Type.VotingPower) {
            return RulePrototyper.prototypeRule(new VotingPowerRule(VotingPowerRule.Mode.MORE_THAN, 0), unprototyped);
        } else if (unprototyped.rule === Rule.Type.WeightForPeriod) {
            return RulePrototyper.prototypeRule(
                new WeightForPeriodRule(0, WeightForPeriodRule.PeriodUnit.SECOND, 0),
                unprototyped
            );
        } else if (unprototyped.rule === Rule.Type.CustomRPC) {
            return RulePrototyper.prototypeRule(new CustomRPCRule("", 0, "", ""), unprototyped);
        } else if (unprototyped.rule === Rule.Type.AgeOfPost) {
            return RulePrototyper.prototypeRule(
                new AgeOfPostRule(AgeOfPostRule.Mode.OLDER_THAN, 0, AgeOfPostRule.TimeUnit.SECOND),
                unprototyped
            );
        } else if (unprototyped.rule === Rule.Type.FirstPost) {
            return RulePrototyper.prototypeRule(new FirstPostRule(), unprototyped);
        } else if (unprototyped.rule === Rule.Type.Payout) {
            return RulePrototyper.prototypeRule(new PayoutRule(PayoutRule.Mode.EQUAL, 0), unprototyped);
        } else if (unprototyped.rule === Rule.Type.VotesCount) {
            return RulePrototyper.prototypeRule(new VotesCountRule(VotesCountRule.Mode.MORE_THAN, 0), unprototyped);
        } else if (unprototyped.rule === Rule.Type.Voters) {
            return RulePrototyper.prototypeRule(new VotersRule(VotersRule.Mode.NONE, []), unprototyped);
        } else if (unprototyped.rule === Rule.Type.ExpirationDate) {
            return RulePrototyper.prototypeRule(new ExpirationDateRule(new Date().toISOString()), unprototyped);
        } else throw new ValidationException("There is no rule with this type (rule=" + unprototyped.rule + ")");
    }

    private static prototypeRule<T extends Rule>(prototyperRule: T, unprototypedObj: object): T {
        prototyperRule.validateRuleObject(unprototypedObj);
        return _.merge(prototyperRule, prototyperRule, unprototypedObj);
    }
}
