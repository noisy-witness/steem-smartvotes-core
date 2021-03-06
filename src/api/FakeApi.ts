/* PROMISE_DEF */
import * as BluebirdPromise from "bluebird";
/* END_PROMISE_DEF */
import * as _ from "lodash";
import * as steem from "steem";

import { Log } from "../log/Log";
import { SetRules } from "../protocol/SetRules";
import { EffectuatedSetRules } from "../protocol/EffectuatedSetRules";
import { SteemOperationNumber, UnifiedSteemTransaction } from "steem-efficient-stream";
import { Api } from "../api/Api";
import { Protocol } from "../protocol/Protocol";
import { EffectuatedWiseOperation } from "../protocol/EffectuatedWiseOperation";
import { V1Handler } from "../protocol/versions/v1/V1Handler";
import { NotFoundException } from "../util/NotFoundException";
import { ConfirmVote } from "../protocol/ConfirmVote";

export class FakeApi extends Api {
    private protocol: Protocol;
    private posts: steem.SteemPost[];
    private transactions: UnifiedSteemTransaction[];
    private dynamicGlobalProperties: steem.DynamicGlobalProperties;
    private accounts: steem.AccountInfo[];
    private blogEntries: steem.BlogEntry[];
    private currentBlock = 0;
    private pushedOperations: UnifiedSteemTransaction[] = [];
    private fakeTime: Date | undefined = undefined;
    private fakeDelayMs: number = 5;
    private transactionsByBlock: { [key: string]: UnifiedSteemTransaction[] } = {};

    public constructor(
        protocol: Protocol,
        posts: steem.SteemPost[],
        dynamicGlobalProperties: steem.DynamicGlobalProperties,
        accounts: steem.AccountInfo[],
        transactions: UnifiedSteemTransaction[],
        blogEntries: steem.BlogEntry[]
    ) {
        super();

        this.protocol = protocol;
        this.posts = posts;
        this.dynamicGlobalProperties = dynamicGlobalProperties;
        this.accounts = accounts;
        this.transactions = transactions;
        this.transactions = this.transactions.map((trx: UnifiedSteemTransaction) => {
            trx.timestamp = new Date(trx.timestamp as any); // prototype timestamp loaded from json
            return trx;
        });
        /*this.currentBlock = Math.max(
            this.transactions.map(trx => trx.block_num).reduce((maxBlockNum, thisBlockNum) => maxBlockNum = Math.max(maxBlockNum, thisBlockNum), 0),
            this.dynamicGlobalProperties.head_block_number
        );*/
        this.currentBlock =
            this.transactions
                .map(trx => trx.block_num)
                .reduce((maxBlockNum, thisBlockNum) => (maxBlockNum = Math.max(maxBlockNum, thisBlockNum)), 0) + 1;
        this.blogEntries = blogEntries;

        this.transactions.forEach(trx => {
            if (this.transactionsByBlock.hasOwnProperty(trx.block_num + "")) {
                this.transactionsByBlock[trx.block_num + ""].push(trx);
            } else this.transactionsByBlock[trx.block_num + ""] = [trx];
        });
    }

    public static fromDataset(protocol: Protocol, dataset: FakeApi.Dataset): FakeApi {
        return new FakeApi(
            protocol,
            dataset.posts,
            dataset.dynamicGlobalProperties,
            dataset.accounts,
            dataset.transactions,
            dataset.blogEntries
        );
    }

    public name(): string {
        return "FakeApi";
    }

    public async loadPost(author: string, permlink: string): Promise<steem.SteemPost> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        for (let i = 0; i < this.posts.length; i++) {
            if (this.posts[i].author === author && this.posts[i].permlink === permlink) {
                return this.posts[i];
            }
        }
        throw new NotFoundException("No such post @" + author + "/" + permlink);
    }

    /*public loadRulesets(forWh, at: SteemOperationNumber, protocol: Protocol): Promise<EffectuatedSetRules> {
        return this.loadAllRulesets(delegator, at, protocol).then((rulesets: EffectuatedSetRules []) => {
            const votersRulesets: EffectuatedSetRules[] =  rulesets
                .filter((ruleset: EffectuatedSetRules) => ruleset.voter == voter);

            if (votersRulesets.length == 0) return { rulesets: [], moment: SteemOperationNumber.NEVER, voter: "", delegator: "" } as EffectuatedSetRules;
            else return votersRulesets.reduce((result: EffectuatedSetRules, ruleset: EffectuatedSetRules) => {
                if (ruleset.moment.isGreaterThan(result.moment)) return ruleset;
                else return result;
            });
        });
    }*/

    public async sendToBlockchain(
        operationsInTransaction: steem.OperationWithDescriptor[]
    ): Promise<SteemOperationNumber> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        const blockNum = this.currentBlock + 1;
        const steemTrx: UnifiedSteemTransaction = {
            block_num: blockNum,
            transaction_num: 0,
            transaction_id: "",
            timestamp: this.fakeTime ? this.fakeTime : new Date(),
            ops: _.reverse(operationsInTransaction),
        };
        this.transactions.push(steemTrx);
        this.pushedOperations.push(steemTrx);
        this.transactionsByBlock[blockNum + ""] = [steemTrx];
        this.currentBlock = blockNum;

        Log.log().debugGen(() => ["FAKE_API_PUSHED_TRX=" + JSON.stringify(steemTrx)]);
        return new SteemOperationNumber(blockNum, 0, operationsInTransaction.length - 1);
    }

    public async loadRulesets(
        forWhom: { voter: string; delegator: string },
        at: SteemOperationNumber
    ): Promise<EffectuatedSetRules[]> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        if (!forWhom.voter && !forWhom.delegator)
            throw new Error("You have to specify either a voter, a delegator or both of them.");

        const allRules: EffectuatedSetRules[] = [];
        for (let i = 0; i < this.transactions.length; i++) {
            const trx = this.transactions[i];
            const handleResult = this.protocol.handleOrReject(trx);
            if (handleResult) {
                for (let j = 0; j < handleResult.length; j++) {
                    const effSo = handleResult[j];
                    if (SetRules.isSetRules(effSo.command)) {
                        if (
                            (forWhom.delegator &&
                                forWhom.voter &&
                                effSo.delegator === forWhom.delegator &&
                                effSo.voter === forWhom.voter) ||
                            (forWhom.delegator && !forWhom.voter && effSo.delegator === forWhom.delegator) ||
                            (!forWhom.delegator && forWhom.voter && effSo.voter === forWhom.voter)
                        ) {
                            if (at.isGreaterOrEqual(effSo.moment)) {
                                const effSetRules: EffectuatedSetRules = {
                                    rulesets: effSo.command.rulesets,
                                    voter: effSo.voter,
                                    delegator: effSo.delegator,
                                    moment: effSo.moment,
                                };
                                allRules.push(effSetRules);
                            }
                        }
                    }
                }
            }
        }

        const allRulesGrouppedByVoter: { [voter: string]: EffectuatedSetRules[] } = _.groupBy(allRules, "voter");

        const out: EffectuatedSetRules[] = [];
        _.forOwn(allRulesGrouppedByVoter, (esr: EffectuatedSetRules[], voter: string) => {
            out.push(esr.sort((a, b) => SteemOperationNumber.compare(a.moment, b.moment)).reverse()[0]);
        });
        return out;
    }

    public async getLastConfirmationMoment(delegator: string): Promise<SteemOperationNumber> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        return this.transactions
            .map((trx: UnifiedSteemTransaction) => this.protocol.handleOrReject(trx))
            .filter((handledOrRejected: EffectuatedWiseOperation[] | undefined) => !!handledOrRejected)
            .map((handled: EffectuatedWiseOperation[] | undefined) => handled as EffectuatedWiseOperation[])
            .reduce((allOps: EffectuatedWiseOperation[], nextOps: EffectuatedWiseOperation[]) => allOps.concat(nextOps))
            .filter((effSop: EffectuatedWiseOperation) => ConfirmVote.isConfirmVote(effSop.command))
            .map((effSop: EffectuatedWiseOperation) => effSop.moment)
            .reduce((newest: SteemOperationNumber, current: SteemOperationNumber) => {
                if (current.isGreaterThan(newest)) return current;
                else return newest;
            }, V1Handler.INTRODUCTION_OF_WISE_MOMENT);
    }

    public async getAllWiseOperationsInBlock(
        blockNum: number,
        delegatorFilter?: string
    ): Promise<EffectuatedWiseOperation[]> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        if (blockNum > this.currentBlock + 1)
            throw new Error(
                "Cannot get block that has number (" +
                    blockNum +
                    ") greater than next block (" +
                    (this.currentBlock + 1) +
                    ") (blockNum must be <= this.currentBlockNum+1)"
            );

        while (blockNum > this.currentBlock) await BluebirdPromise.delay(this.fakeDelayMs);
        await BluebirdPromise.delay(this.fakeDelayMs);

        if (this.transactionsByBlock.hasOwnProperty(blockNum + "")) {
            return this.transactionsByBlock[blockNum + ""]
                .filter((trx: UnifiedSteemTransaction) => trx.block_num === blockNum)
                .map((trx: UnifiedSteemTransaction) => this.protocol.handleOrReject(trx))
                .filter((handledOrRejected: EffectuatedWiseOperation[] | undefined) => !!handledOrRejected)
                .map((handled: EffectuatedWiseOperation[] | undefined) => handled as EffectuatedWiseOperation[])
                .reduce(
                    (allOps: EffectuatedWiseOperation[], nextOps: EffectuatedWiseOperation[]) => allOps.concat(nextOps),
                    []
                )
                .filter((effSop: EffectuatedWiseOperation) =>
                    delegatorFilter ? effSop.delegator === delegatorFilter : true
                );
        } else return [];
    }

    public async getWiseOperationsRelatedToDelegatorInBlock(
        delegator: string,
        blockNum: number
    ): Promise<EffectuatedWiseOperation[]> {
        return this.getAllWiseOperationsInBlock(blockNum, delegator);
    }

    public async getDynamicGlobalProperties(): Promise<steem.DynamicGlobalProperties> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        this.dynamicGlobalProperties.time = new Date().toISOString().replace("Z", "");
        this.dynamicGlobalProperties.head_block_number = this.currentBlock;
        return _.cloneDeep(this.dynamicGlobalProperties);
    }

    public async getAccountInfo(username: string): Promise<steem.AccountInfo> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        const result = this.accounts.filter((info: steem.AccountInfo) => info.name === username);
        if (result.length === 0) throw new NotFoundException("Account " + username + " does not exist");
        else return result[0];
    }

    public async getWiseOperations(username: string, until: Date): Promise<EffectuatedWiseOperation[]> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        const result: EffectuatedWiseOperation[] = [];
        for (let i = 0; i < this.transactions.length; i++) {
            const op = this.transactions[i];
            const handleResult = this.protocol.handleOrReject(op);
            if (handleResult) {
                for (let j = 0; j < handleResult.length; j++) {
                    const effSo = handleResult[j];
                    if (
                        (effSo.delegator === username && ConfirmVote.isConfirmVote(effSo.command)) ||
                        effSo.voter === username
                    ) {
                        // if (isConfirmVote(effSo.command) && effSo.command.accepted && !isConfirmVoteBoundWithVote(effSo.command)) Log.log().debugGen(() => [JSON.stringify(effSo)]);
                        // (up) fake blockchain does not provide
                        // information on who pushed the operation to blockchain,
                        // so this hacky way is the only way to get this information.
                        // fortunately FakeApi is only used for unit testing.
                        if (effSo.timestamp.getTime() >= until.getTime()) {
                            result.push(effSo);
                        }
                    }
                }
            }
        }
        return result;
    }

    public async getBlogEntries(username: string, startFrom: number, limit: number): Promise<steem.BlogEntry[]> {
        await BluebirdPromise.delay(this.fakeDelayMs);

        const result: steem.BlogEntry[] = [];
        let userI = 0;
        for (let i = 0; i < this.blogEntries.length; i++) {
            const entry = this.blogEntries[i];
            if (entry.blog == username) {
                if (userI >= startFrom && userI < startFrom + limit) result.push(entry);
                userI++;
            }
        }
        return result;
    }

    public getCurrentBlockNum(): number {
        return this.currentBlock;
    }

    public pushFakeBlock(): Promise<SteemOperationNumber> {
        const op: steem.OperationWithDescriptor = ["fake", {}];
        return this.sendToBlockchain([op]);
    }

    /**
     * Returns all operations that were pushed using #sentToBlockchain() after initialization of FakeApi.
     */
    public getPushedTransactions(): UnifiedSteemTransaction[] {
        return this.pushedOperations;
    }

    public setFakeTime(fakeTime_: Date) {
        this.fakeTime = fakeTime_;
    }

    public setFakeDelayMs(delayMs: number) {
        this.fakeDelayMs = delayMs;
    }
}

export namespace FakeApi {
    export interface Dataset {
        posts: steem.SteemPost[];
        dynamicGlobalProperties: steem.DynamicGlobalProperties;
        accounts: steem.AccountInfo[];
        transactions: UnifiedSteemTransaction[];
        blogEntries: steem.BlogEntry[];
    }
}
