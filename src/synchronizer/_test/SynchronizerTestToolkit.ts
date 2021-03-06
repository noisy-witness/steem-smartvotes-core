import * as BluebirdPromise from "bluebird";
import { Wise, SingleDaemon, SteemOperationNumber } from "../../wise";
import { Log } from "../../log/Log";
import { Util } from "../../util/util";

export class SynchronizerTestToolkit {
    public synchronizer: SingleDaemon | undefined;
    public synchronizerPromise: BluebirdPromise<void> | undefined;
    private wise: Wise;

    public constructor(wise: Wise) {
        this.wise = wise;
    }

    public start(blockNum: number) {
        this.synchronizerPromise = new BluebirdPromise<void>((resolve, reject) => {
            Log.log().verbose("Starting synchronizer");
            this.synchronizer = this.wise.startDaemon(
                new SteemOperationNumber(blockNum, 0, 0),
                (error: Error | undefined, event: SingleDaemon.Event): void => {
                    if (event.type === SingleDaemon.EventType.SynchronizationStop) {
                        Log.log().debug("Synchronizer stopper");
                        resolve();
                    }
                    // if (event.type === Synchronizer.EventType.OperarionsPushed) Log.log().info(event);

                    if (error) {
                        Log.log().debug("Synchronizer error, calling stop");
                        this.getSynchronizer().stop();
                        reject(error);
                    }
                }
            );
        });
        (async () => await Util.definedOrThrow(this.synchronizerPromise).then(() => {}))();
    }

    public getSynchronizer(): SingleDaemon {
        if (!this.synchronizer) throw new Error("Synchronizer not created");
        return this.synchronizer;
    }

    public getSynchronizerPromise(): BluebirdPromise<void> {
        if (!this.synchronizerPromise) throw new Error("SynchronizerPromise not created");
        return this.synchronizerPromise;
    }
}
