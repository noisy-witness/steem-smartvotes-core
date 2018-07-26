import * as _ from "lodash";
import { Rule } from "./Rule";
import { ValidationException } from "../validation/ValidationException";
import { ValidationContext } from "../validation/ValidationContext";
import { Promise } from "bluebird";
import { SendVoteorder } from "../protocol/SendVoteorder";
import { EffectuatedSmartvotesOperation } from "../protocol/EffectuatedSmartvotesOperation";
import { ConfirmVote, isConfirmVote, isConfirmVoteBoundWithVote } from "../protocol/ConfirmVote";

/**
 * This rule limits total absolute weight)of confirmed voteorders over given period of time.
 * It sums up absolute weights of upvotes and flags.
 */
export class WeightForPeriodRule extends Rule {
    public rule: string = Rule.Type.WeightForPeriod;
    public unit: WeightForPeriodRule.PeriodUnit;
    public period: number;
    public weight: number;

    public constructor(period: number, unit: WeightForPeriodRule.PeriodUnit, weight: number) {
        super();

        this.period = period;
        this.unit = unit;
        this.weight = weight;
    }

    public type(): Rule.Type {
        return Rule.Type.WeightForPeriod;
    }

    public validate (voteorder: SendVoteorder, context: ValidationContext, validationTimestamp: Date = new Date() /* for unit testing */): Promise<void> {
        return Promise.resolve()
        .then(() => this.validateRuleObject(this))
        .then(() => {
            const unitMultiplier = (this.unit === WeightForPeriodRule.PeriodUnit.DAY ? 24 * 60 * 60 :
                                   (this.unit === WeightForPeriodRule.PeriodUnit.HOUR ? 60 * 60 :
                                   (this.unit === WeightForPeriodRule.PeriodUnit.MINUTE ? 60 :
                                   1)));
            const numberOfSeconds = this.period * unitMultiplier;
            const until = new Date(validationTimestamp.getTime() - numberOfSeconds * 1000);
            return context.getWiseOperations(context.getDelegatorUsername(), until);
        })
        .then((ops: EffectuatedSmartvotesOperation []) => {
            let sumOfWeightsForGivenPeriod = 0;
            ops.forEach(op => {
                if (isConfirmVote(op.command)) {
                    const confirmVoteOp: ConfirmVote = op.command;
                    // count only accepted vote confirmations:
                    if (confirmVoteOp.accepted && isConfirmVoteBoundWithVote(confirmVoteOp)) {
                        sumOfWeightsForGivenPeriod += confirmVoteOp.vote.weight;
                    }
                }
            });

            if (sumOfWeightsForGivenPeriod > this.weight) {
                throw new ValidationException(
                    "WeightForPeriodRule: Sum of passed voteorders (" + sumOfWeightsForGivenPeriod + ")"
                    + " was higher than allowed (" + this.weight + ") in a period of "
                    + this.period + " " + this.unit
                );
            }
        });
    }

    public validateRuleObject(unprototypedObj: any) {
        ["period", "unit", "weight"].forEach(prop => {
            if (!_.has(unprototypedObj, prop)) throw new ValidationException("WeightForPeriodRule: property " + prop + " is missing");
        });
        if (Math.abs(unprototypedObj.weight) > 10000)
            throw new ValidationException("WeightForPeriodRule: absolute value of .min ( " + unprototypedObj.min + " ) is > 10000");

        if (!_.includes([
            WeightForPeriodRule.PeriodUnit.DAY, WeightForPeriodRule.PeriodUnit.HOUR,
            WeightForPeriodRule.PeriodUnit.MINUTE, WeightForPeriodRule.PeriodUnit.SECOND
        ], unprototypedObj.unit))
            throw new ValidationException("WeightForPeriodRule: unknown unit " + unprototypedObj.unit);
    }
}

export namespace WeightForPeriodRule {
    export enum PeriodUnit {
        DAY = "day",
        HOUR = "hour",
        MINUTE = "minute",
        SECOND = "second"
    }
}