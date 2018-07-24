import * as ajv from "ajv";
import * as _ from "lodash";

import { ProtocolVersionHandler } from "../ProtocolVersionHandler";
import { SmartvotesOperation } from "../../SmartvotesOperation";
import { SendVoteorder, isSendVoteorder } from "../../SendVoteorder";
import { SetRules, isSetRules } from "../../SetRules";
import { Rule } from "../../../rules/Rule";
import { SteemTransaction } from "../../../blockchain/SteemTransaction";
import { CustomJsonOperation } from "../../../blockchain/CustomJsonOperation";
import { EffectuatedSmartvotesOperation } from "../../EffectuatedSmartvotesOperation";
import { SteemOperationNumber } from "../../../blockchain/SteemOperationNumber";
import { isConfirmVote, ConfirmVote, ConfirmVoteBoundWithVote } from "../../ConfirmVote";
import { wise_operation, wise_set_rules, wise_rule, wise_send_voteorder_operation, wise_set_rules_operation, wise_confirm_vote_operation } from "./wise-schema";
import { wise_rule_decode, wise_rule_encode } from "./rules-schema";
import { VoteOperation, isVoteOperation } from "../../../blockchain/VoteOperation";

class WiseConstants {
    public static wise_send_voteorder_descriptor: string = "v2:send_voteorder";
    public static wise_set_rules_descriptor: string = "v2:set_rules";
    public static wise_confirm_vote_descriptor: string = "v2:confirm_vote";
    public static wise_descriptors: string [] = [
        WiseConstants.wise_send_voteorder_descriptor,
        WiseConstants.wise_set_rules_descriptor,
        WiseConstants.wise_confirm_vote_descriptor
    ];
}

const aajv: ajv.Ajv = new ajv();
aajv.addMetaSchema(require("ajv/lib/refs/json-schema-draft-06.json"));

const validate = aajv.compile(require("./wise-schema.json"));

export class V2Handler implements ProtocolVersionHandler {
    public static CUSTOM_JSON_ID = "wise";

    public handleOrReject = (transaction: SteemTransaction): EffectuatedSmartvotesOperation [] | undefined => {
        if (transaction.block_num <= 22710498) return undefined;

        /**
         * The following reversion is mandatory, because when wise is publishing more than one
         * operation in a single transaction (eg. vote + confirm_vote), it always puts wise operation as the last one.
         */
        const operations = _.reverse(transaction.ops);

        if (operations[0][0] != "custom_json" || (operations[0][1] as CustomJsonOperation).id != V2Handler.CUSTOM_JSON_ID) {
            return undefined;
        }

        if ((operations[0][1] as CustomJsonOperation).required_posting_auths.length != 1) {
            return undefined; // must be authorized by single user
        }

        if (!this.isMyOperation((operations[0][1] as CustomJsonOperation).json)) {
            return undefined;
        }

        const jsonObj = JSON.parse((operations[0][1] as CustomJsonOperation).json);
        if (!this.validateJSON(jsonObj)) {
            return undefined;
        }

        const wiseOp = jsonObj as wise_operation;


        return this.decode(transaction, wiseOp, (operations[0][1] as CustomJsonOperation).required_posting_auths[0]);
    }

    private isMyOperation = (jsonStr: string): boolean => {
        const descriptorStart = jsonStr.indexOf("\"") + 1;
        const descriptor = jsonStr.substring(descriptorStart, jsonStr.indexOf("\"", descriptorStart));
        return WiseConstants.wise_descriptors.indexOf(descriptor) !== -1;
    }

    private validateJSON = (input: object): boolean => {
        return validate(input) as boolean;
    }

    private decode = (transaction: SteemTransaction, wiseOp: wise_operation, sender: string): EffectuatedSmartvotesOperation [] | undefined => {
        if (wiseOp[0] == WiseConstants.wise_confirm_vote_descriptor) {
            return this.decodeConfirmVote(transaction, wiseOp as wise_confirm_vote_operation, sender);
        }
        if (wiseOp[0] == WiseConstants.wise_set_rules_descriptor) {
            return this.decodeSetRules(transaction, wiseOp as wise_set_rules_operation, sender);
        }
        else if (wiseOp[0] == WiseConstants.wise_send_voteorder_descriptor) {
            return this.decodeSendVoteorder(transaction, wiseOp as wise_send_voteorder_operation, sender);
        }
        else return undefined;
    }

    private decodeSetRules = (transaction: SteemTransaction, wiseOp: wise_set_rules_operation, sender: string): EffectuatedSmartvotesOperation [] => {
        const rulesets: { name: string, rules: Rule []} [] = [];

        for (let i = 0; i < (wiseOp[1] as wise_set_rules).rulesets.length; i++) {
            const ruleset: [string, wise_rule []] = (wiseOp[1] as wise_set_rules).rulesets[i];
            rulesets.push(this.decodeRuleset(ruleset));
        }

        const out: EffectuatedSmartvotesOperation = {
            moment: new SteemOperationNumber(transaction.block_num, transaction.transaction_num, 0 /* skip operation num due to rejection that was done in #handleOrReject */),
            transaction_id: transaction.transaction_id,
            timestamp: transaction.timestamp,

            voter: (wiseOp[1] as wise_set_rules).voter,
            delegator: sender,

            command: {
                rulesets: rulesets
            } as SetRules
        };

        return [out];
    }

    private decodeRuleset = (ruleset: [string, wise_rule []]): {name: string, rules: Rule []} => {
        const rules: Rule [] = [];

        for (let i = 0; i < ruleset[1].length; i++) {
            const rule = ruleset[1][i];
            const decodeed = wise_rule_decode(rule);
            if (decodeed) rules.push(decodeed);
        }

        return {name: ruleset[0], rules};
    }

    private decodeSendVoteorder = (transaction: SteemTransaction, wiseOp: wise_send_voteorder_operation, sender: string): EffectuatedSmartvotesOperation [] => {
        const cmd: SendVoteorder = {
            rulesetName: wiseOp[1].ruleset,
            permlink: wiseOp[1].permlink,
            author: wiseOp[1].author,
            weight: wiseOp[1].weight
        };
        return [{
            moment: new SteemOperationNumber(transaction.block_num, transaction.transaction_num, 0 /* skip operation num due to rejection that was done in #handleOrReject */),
            transaction_id: transaction.transaction_id,
            timestamp: transaction.timestamp,

            voter: sender,
            delegator: wiseOp[1].delegator,

            command: cmd
        } as EffectuatedSmartvotesOperation];
    }

    private decodeConfirmVote = (transaction: SteemTransaction, wiseOp: wise_confirm_vote_operation, sender: string): EffectuatedSmartvotesOperation [] => {
        let voteOp: VoteOperation | undefined = undefined;

        if (transaction.ops.length === 2
         && transaction.ops[1][0] === "vote") {
             const potentialVoteOp: object = transaction.ops[1][1];
             if (isVoteOperation(potentialVoteOp)) {
                 voteOp = potentialVoteOp;
             }
        }

        let cmd: ConfirmVote | ConfirmVoteBoundWithVote;
        if (voteOp) {
            const cmd_: ConfirmVoteBoundWithVote = {
                voteorderTxId: wiseOp[1].tx_id,
                accepted: wiseOp[1].accepted,
                msg: wiseOp[1].msg,
                vote: voteOp,
            };
            cmd = cmd_;
        }
        else {
            const cmd_: ConfirmVote = {
                voteorderTxId: wiseOp[1].tx_id,
                accepted: wiseOp[1].accepted,
                msg: wiseOp[1].msg,
            };
            cmd = cmd_;
        }

        return [{
            moment: new SteemOperationNumber(transaction.block_num, transaction.transaction_num, 0 /* skip operation num due to rejection that was done in #handleOrReject */),
            transaction_id: transaction.transaction_id,
            timestamp: transaction.timestamp,

            voter: wiseOp[1].voter,
            delegator: sender,

            command: cmd
        } as EffectuatedSmartvotesOperation];
    }

    public serializeToBlockchain = (op: SmartvotesOperation): [string, object][] => {
        let senderUsername = "";
        let jsonObj: wise_operation;

        if (isSetRules(op.command)) {
            senderUsername = op.delegator;

            const rulesets: [string, wise_rule []] [] = [];

            for (let i = 0; i < op.command.rulesets.length; i++) {
                const ruleset = op.command.rulesets[i];
                rulesets.push(this.serializeRuleset(ruleset));
            }

            jsonObj = ["v2:set_rules", {
                voter: op.voter,
                rulesets: rulesets
            }];
        }
        else if (isSendVoteorder(op.command)) {
            senderUsername = op.voter;
            jsonObj = ["v2:send_voteorder", {
                delegator: op.delegator,
                ruleset: op.command.rulesetName,
                author: op.command.author,
                permlink: op.command.permlink,
                weight: op.command.weight
            }];
        }
        else if (isConfirmVote(op.command)) {
            senderUsername = op.delegator;
            jsonObj = ["v2:confirm_vote", {
                voter: op.voter,
                tx_id: op.command.voteorderTxId,
                accepted: op.command.accepted,
                msg: op.command.msg
            }];
        }
        else throw new Error("Unknown type of command");

        const completeOp: [string, object] = ["custom_json", {
            id: V2Handler.CUSTOM_JSON_ID,
            json: JSON.stringify(jsonObj),
            required_auths: [],
            required_posting_auths: [ senderUsername ]
        } as CustomJsonOperation];

        validate(completeOp);
        return [ completeOp ];
    }

    private serializeRuleset = (r: { name: string, rules: Rule [] }): [string, wise_rule []] => {
        const out: wise_rule [] = [];
        for (let i = 0; i < r.rules.length; i++) {
            const rule = r.rules[i];
            out.push(wise_rule_encode(rule));
        }
        return [r.name, out];
    }
}