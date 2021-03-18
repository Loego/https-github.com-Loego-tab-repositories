import axios from 'axios';
import Emitter from 'tiny-emitter';
import {HUB_API_URL, HUB_TRANSFER_STATUS} from "~/assets/variables";
import addToCamelInterceptor from '~/assets/to-camel.js';
import {isHubTransferFinished} from '~/assets/utils.js';

const instance = axios.create({
    baseURL: HUB_API_URL,
});
addToCamelInterceptor(instance);

/**
 *
 * @return {Promise<{min: string, fast: string}>}
 */
export function getOracleEthFee() {
    return instance.get('oracle/eth_fee')
        .then((response) => {
            return response.data.result;
        });
}

/**
 * @return {Promise<Array<HubCoinItem>>}
 */
export function getOracleCoinList() {
    return instance.get('oracle/coins')
        .then((response) => {
            return response.data.result;
        });
}

/**
 * @return {Promise<Array<{name: string, value: string}>>}
 */
export function getOraclePriceList() {
    return instance.get('oracle/prices')
        .then((response) => {
            return response.data.result.list;
        });
}

/**
 *
 * @param hash
 * @return {Promise<{status: string, txHash: string}>}
 */
export function getMinterTxStatus(hash) {
    return instance.get(`minter/tx_status/${hash}`)
        .then((response) => {
            return response.data.result;
        });
}

export function subscribeTransfer(hash, timestamp) {
    let isUnsubscribed = false;
    let lastStatus;
    const emitter = new Emitter();

    const statusPromise = pollMinterTxStatus()
        .then((transfer) => {
            emitter.emit('finished', transfer);
            return transfer;
        });

    // proxy `.on` and `.once`
    proxyEmitter(statusPromise, emitter);

    // unsubscribe from all events and disable polling
    statusPromise.unsubscribe = function() {
        isUnsubscribed = true;
        emitter.off('update');
        emitter.off('finished');
    };

    return statusPromise;


    function proxyEmitter(target, emitter) {
        target.on = function() {
            emitter.on(...arguments);
            return target;
        };
        target.once = function() {
            emitter.once(...arguments);
            return target;
        };
        // target.off = function () {
        //     emitter.off(...arguments);
        //     return target;
        // }
    }

    function pollMinterTxStatus() {
        return getMinterTxStatus(hash)
            .catch((error) => {
                console.log(error);
            })
            .then((transfer) => {
                // reject
                if (isUnsubscribed) {
                    throw new Error('unsubscribed');
                }

                // no transfer when error
                if (transfer) {
                    const txDate = timestamp ? new Date(timestamp) : new Date();
                    const isLong = Date.now() - txDate.getTime() > 10 * 60 * 1000;
                    if (isLong && transfer.status === HUB_TRANSFER_STATUS.not_found) {
                        transfer = {
                            ...transfer,
                            status: HUB_TRANSFER_STATUS.not_found_long,
                        };
                    }

                    if (lastStatus !== transfer.status) {
                        lastStatus = transfer.status;
                        emitter.emit('update', transfer);
                    }

                    if (isHubTransferFinished(transfer.status)) {
                        return transfer;
                    }
                }

                return wait(10000).then(() => pollMinterTxStatus(hash));
            });
    }
}

function wait(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

/**
 * @typedef {object} HubCoinItem
 * @property {string} denom
 * @property {string} ethAddr
 * @property {string} minterId
 * @property {string} ethDecimals
 */
