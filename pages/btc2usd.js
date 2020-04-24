import { connect } from "react-redux";
import { Component } from "../components/base";
import BigNumber from 'bignumber.js';
import { Wallet, getSelectedAccount, WalletButton, WalletButtonLong, getSelectedAccountWallet, getTransactionReceipt } from "wan-dex-sdk-wallet";
import "wan-dex-sdk-wallet/index.css";
import lotteryAbi from "./abi/lottery";
import style from './style.less';
import Panel from '../components/Panel';
import TrendHistory from '../components/TrendHistory';
import TransactionHistory from '../components/TransactionHistory';
import DistributionHistory from '../components/DistributionHistory';
import UserPanel from '../components/UserPanel';
import sleep from 'ko-sleep';
import { alertAntd, toUnitAmount } from '../utils/utils.js';
import { mainnetSCAddrBtc2Usd, testnetSCAddrBtc2Usd, networkId, nodeUrl } from '../conf/config.js';

const lotterySCAddr = networkId == 1 ? mainnetSCAddrBtc2Usd : testnetSCAddrBtc2Usd;
const storagePrefix = 'btc2usd_';
var Web3 = require("web3");

let debugStartTime = (Date.now() / 1000)


class IndexPage extends Component {
  constructor(props) {
    super(props);
    this.state = {};

    this.checkSCUpdate();

    window.alertAntd = alertAntd;

    let trendStr = window.localStorage.getItem(storagePrefix + 'currentTrend');
    let trend = null;
    if (trendStr) {
      trend = JSON.parse(trendStr);
    } else {
      trend = {
        round: 0,
        startTime: debugStartTime,
        timeSpan: 3600 * 12,
        stopBefore: 3600 * 2,
        btcPriceStart: 0,
        randomPoolAmount: 0,
        upPoolAmount: 0,
        downPoolAmount: 0,
        lotteryRound: 0,
      };
    }

    let trendHistoryStr = window.localStorage.getItem(storagePrefix + 'trendHistory');
    let trendHistory = [];
    if (trendHistoryStr) {
      trendHistory = JSON.parse(trendHistoryStr);
    }

    this.state = {
      trendInfo: trend,
      trendHistory: trendHistory,
      transactionHistory: this.getTransactionHistory(),
      lotteryHistory: this.getLotteryHistory(),
      randomSpinning: false,
      amountInfo: {
        upAmount: 0,
        downAmount: 0,
        upOdds: 0.9,
        downOdds: 0.9,
        expectReturn: 0,
      },
      lastRoundAmountInfo: {
        upAmount: 0,
        downAmount: 0,
        upOdds: 0.9,
        downOdds: 0.9,
        expectReturn: 0,
      },
      lastRoundLotteryInfo: {
        eachAmount: 0,
        winTimes: 0,
        totalWin: 0,
      },
      totalHistory: {
        totalBuy: 0,
        inReturn: 0,
        fromLottery: 0,
        totalAmount: 0
      }
    }

    window.debugState = this.state;

    Date.prototype.format = function (fmt) {
      var o = {
        "M+": this.getMonth() + 1,                 //月份 
        "d+": this.getDate(),                    //日 
        "h+": this.getHours(),                   //小时 
        "m+": this.getMinutes(),                 //分 
        "s+": this.getSeconds(),                 //秒 
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度 
        "S": this.getMilliseconds()             //毫秒 
      };
      if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
      }
      for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
          fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
      }
      return fmt;
    }
  }

  checkSCUpdate() {
    let scOld = window.localStorage.getItem(storagePrefix + 'lotterySmartContract');
    if (!scOld || scOld !== lotterySCAddr) {
      console.log('Detect smart contract update.');
      // window.localStorage.clear();
      window.localStorage.setItem(storagePrefix + 'lotterySmartContract', lotterySCAddr);
      window.localStorage.removeItem(storagePrefix + 'trendHistory');
      window.localStorage.removeItem(storagePrefix + 'randomHistory');
      window.localStorage.removeItem(storagePrefix + 'currentTrend');
      window.localStorage.removeItem(storagePrefix + 'RandomHistoryStartBlock');
    }
  }

  async componentDidMount() {
    var web3 = new Web3();
    web3.setProvider(new Web3.providers.HttpProvider(nodeUrl));
    this.web3 = web3;
    this.lotterySC = new this.web3.eth.Contract(lotteryAbi, lotterySCAddr);
    try {
      await this.getOnce();
      await this.updateTrendInfoFromNode();
      this.timerTrendInfo = setInterval(this.updateTrendInfoFromNode, 20000);
      this.timerTrendHistory = setInterval(this.updateTrendHistoryFromNode, 60 * 1000);
      this.timerTransactionHistory = setInterval(this.flushTransactionHistory, 100 * 1000);
    } catch (err) {
      console.log(err);
      alertAntd('rpc node server Error, please try later.');
    }

  }

  componentWillUnmount() {
    if (this.timerTrendInfo) {
      clearInterval(this.timerTrendInfo);
    }

    if (this.timerTrendHistory) {
      clearInterval(this.timerTrendHistory);
    }

    if (this.timerTransactionHistory) {
      clearInterval(this.timerTransactionHistory);
    }
  }

  setTrendInfo = (trendInfo) => {
    let stateTrend = JSON.stringify(this.state.trendInfo);
    let inComeTrend = JSON.stringify(trendInfo);
    if (stateTrend !== inComeTrend) {
      this.setState({ trendInfo });
      window.localStorage.setItem(storagePrefix + 'currentTrend', inComeTrend);
    }
  }

  getOnce = async () => {
    let trend = {
      round: 0,
      startTime: debugStartTime,
      timeSpan: 0,
      stopBefore: 0,
      btcPriceStart: 0,
      randomPoolAmount: 0,
      upPoolAmount: 0,
      downPoolAmount: 0,
      lotteryRound: 0,
      randomEndTime: 0,
      chainEndTime: 0,
    };
    let lotterySC = this.lotterySC;

    let awaitArray = [];
    awaitArray.push(lotterySC.methods.curUpDownRound().call());
    awaitArray.push(lotterySC.methods.curRandomRound().call());
    awaitArray.push(lotterySC.methods.gameStartTime().call());
    awaitArray.push(lotterySC.methods.upDownLotteryTimeCycle().call());
    awaitArray.push(lotterySC.methods.feeRatio().call());
    awaitArray.push(lotterySC.methods.upDownLtrstopTimeSpanInAdvance().call());
    awaitArray.push(lotterySC.methods.randomLotteryTimeCycle().call());
    awaitArray.push(lotterySC.methods.chainEndTime().call());


    [
      trend.round,
      trend.lotteryRound,
      trend.gameStartTime,
      trend.timeSpan,
      trend.feeRatio,
      trend.stopBefore,
      trend.randomTimeCycle,
      trend.chainEndTime,
    ] = await Promise.all(awaitArray);


    trend.round = Number(trend.round);
    trend.lotteryRound = Number(trend.lotteryRound);
    trend.gameStartTime = Number(trend.gameStartTime);
    trend.timeSpan = Number(trend.timeSpan);
    trend.feeRatio = Number(trend.feeRatio);
    trend.stopBefore = Number(trend.stopBefore);
    trend.randomTimeCycle = Number(trend.randomTimeCycle);
    trend.chainEndTime = Number(trend.chainEndTime);

    awaitArray = []
    awaitArray.push(lotterySC.methods.updownGameMap(trend.round).call());
    awaitArray.push(lotterySC.methods.randomGameMap(trend.lotteryRound).call());
    awaitArray.push(lotterySC.methods.extraPrizeMap(trend.lotteryRound).call());


    let [roundInfo, randomInfo, extraPrice] = await Promise.all(awaitArray);


    trend.startTime = trend.round * trend.timeSpan + trend.gameStartTime;
    trend.btcPriceStart = Number(roundInfo.openPrice) / 1e8;
    trend.upPoolAmount = Number(roundInfo.upAmount) / 1e18;
    trend.downPoolAmount = Number(roundInfo.downAmount) / 1e18;
    trend.randomPoolAmount = ((Number(randomInfo.stakeAmount)) / 1e18 * (trend.feeRatio / 1000) + Number(extraPrice) / 1e18).toFixed(1);
    trend.randomEndTime = Number((trend.lotteryRound + 1) * trend.randomTimeCycle) + Number(trend.gameStartTime);
    this.setTrendInfo(trend);
    this.flushTransactionHistory();

    this.getUserPanalInfo();
  }

  updateTrendInfoFromNode = async () => {
    let trend = Object.assign({}, this.state.trendInfo);
    let lotterySC = this.lotterySC;
    let roundOld = trend.round;

    let awaitArray = [];
    awaitArray.push(lotterySC.methods.curUpDownRound().call());
    awaitArray.push(lotterySC.methods.curRandomRound().call());
    awaitArray.push(lotterySC.methods.updownGameMap(trend.round).call());
    awaitArray.push(lotterySC.methods.randomGameMap(trend.lotteryRound).call());
    awaitArray.push(lotterySC.methods.extraPrizeMap(trend.lotteryRound).call());
    awaitArray.push(lotterySC.methods.chainEndTime().call());

    let roundInfo = {};
    let randomInfo = {};
    let extraPrice = 0;

    [trend.round, trend.lotteryRound, roundInfo, randomInfo, extraPrice, trend.chainEndTime] = await Promise.all(awaitArray);

    trend.round = Number(trend.round);
    trend.lotteryRound = Number(trend.lotteryRound);
    trend.chainEndTime = Number(trend.chainEndTime);

    trend.startTime = trend.round * trend.timeSpan + trend.gameStartTime;
    trend.btcPriceStart = Number(roundInfo.openPrice) / 1e8;
    trend.upPoolAmount = Number(roundInfo.upAmount) / 1e18;
    trend.downPoolAmount = Number(roundInfo.downAmount) / 1e18;
    trend.randomPoolAmount = ((Number(randomInfo.stakeAmount)) / 1e18 * (trend.feeRatio / 1000) + Number(extraPrice) / 1e18).toFixed(1);
    trend.randomEndTime = Number((trend.lotteryRound + 1) * trend.randomTimeCycle) + Number(trend.gameStartTime);

    this.setTrendInfo(trend);
    this.updateTrendHistoryFromNode();
    this.updateRandomHistoryFromNode();
    if (roundOld != trend.round) {
      this.flushTransactionHistory();
    }
    this.getUserPanalInfo();
  }

  setTrendHistory = (trendHistory) => {
    let stateValue = JSON.stringify(this.state.trendHistory);
    let inComeValue = JSON.stringify(trendHistory);
    if (stateValue !== inComeValue) {
      this.setState({ trendHistory });
      window.localStorage.setItem(storagePrefix + 'trendHistory', inComeValue);
    }
  }

  updateTrendHistoryFromNode = async () => {
    try {
      let trendHistory = this.state.trendHistory.slice();
      if (!trendHistory[0]) {
        trendHistory = [];
      }

      let roundArray = this.getUpDownRoundRange();

      if (roundArray.length === 0) {
        return;
      }

      let lotterySC = this.lotterySC;

      for (let i = 0; i < roundArray.length; i++) {
        let ret = await lotterySC.methods.updownGameMap(roundArray[i]).call();
        trendHistory.push({
          key: roundArray[i],
          round: roundArray[i],
          startPrice: ret.openPrice / 1e8,
          endPrice: ret.closePrice / 1e8,
          result: (ret.openPrice > ret.closePrice) ? 'down' : (ret.openPrice < ret.closePrice) ? 'up' : 'draw',
          upAmount: ret.upAmount / 1e18,
          downAmount: ret.downAmount / 1e18,
          feeTotal: (ret.upAmount / 1e18 + ret.downAmount / 1e18) * this.state.trendInfo.feeRatio / 1000,
          startTime: this.state.trendInfo.gameStartTime + roundArray[i] * this.state.trendInfo.timeSpan,
          endTime: this.state.trendInfo.gameStartTime + (roundArray[i] + 1) * this.state.trendInfo.timeSpan,
        })
        if (trendHistory.length > 29) {
          trendHistory.splice(0, 1);
        }
      }
      this.setTrendHistory(trendHistory);
    } catch (err) {
      console.log(err);
    }
  }

  addRandomHistory = (randomHistories) => {
    const stateHistory = Object.assign({}, this.state.lotteryHistory);
    let history = {};
    if (stateHistory) {
      history = stateHistory;
    }
    for (var i in randomHistories) {
      history[i] = randomHistories[i];
    }
    this.setState({ lotteryHistory: history });
    window.localStorage.setItem(storagePrefix + 'randomHistory', JSON.stringify(history));
  }

  updateRandomHistoryFromNode = async () => {
    try {
      if (this.randomHistoryScanStart) {
        return
      }
      this.randomHistoryScanStart = true;
      let randomHistories = {};
      const { selectedAccount } = this.props;
      const address = selectedAccount ? selectedAccount.get('address') : null;

      let roundArray = this.getRandomRoundRange();
      if (roundArray.length === 0) {
        this.randomHistoryScanStart = false;
        return;
      }

      let lotterySC = this.lotterySC;
      let blockNumber = await this.web3.eth.getBlockNumber();
      let events = await lotterySC.getPastEvents('RandomBingGo', {
        filter: { round: roundArray },
        fromBlock: this.getRandomHistoryStartBlock(),
        toBlock: blockNumber
      });

      if (events && events.length > 0) {
        let addrTotal = {};
        this.setState({ randomSpinning: true });
        for (let i = 0; i < events.length; i++) {
          if (!randomHistories[events[i].returnValues.round]) {
            randomHistories[events[i].returnValues.round] = [];
          }
          let block = await this.web3.eth.getBlock(events[i].blockNumber);
          randomHistories[events[i].returnValues.round].push({
            key: events[i].returnValues.round.toString() + i.toString(),
            blockNumber: events[i].blockNumber,
            time: (new Date(Number(block.timestamp) * 1000)).format("yyyy-MM-dd hh:mm:ss"),
            round: events[i].returnValues.round,
            address: events[i].returnValues.staker.toLowerCase(),
            amountBuy: '--',
            amountPay: (Number(events[i].returnValues.prizeAmount) / 1e18).toFixed(2),
          });
          let addr = events[i].returnValues.staker.toLowerCase();
          let amount = (Number(events[i].returnValues.prizeAmount) / 1e18).toFixed(2);
          let round = events[i].returnValues.round;
          if (!addrTotal[addr]) {
            addrTotal[addr] = {};
            addrTotal[addr].rounds = {};
          }
          if (!addrTotal[addr].rounds[round]) {
            addrTotal[addr].rounds[round] = {};
            addrTotal[addr].rounds[round].amount = 0;
            addrTotal[addr].rounds[round].key = events[i].transactionHash;
            addrTotal[addr].rounds[round].time = (new Date(Number(block.timestamp) * 1000)).format("yyyy-MM-dd hh:mm:ss");
          }

          addrTotal[addr].rounds[round].amount += Number(amount);
        }
        for (var addr in addrTotal) {
          if (address.toLowerCase() === addr) {
            for (var round in addrTotal[addr].rounds) {
              let txHistory = this.getTransactionHistory();
              let bHave = false;
              for (let h = 0; h < txHistory.length; h++) {
                if (txHistory[h].type.toLowerCase() == 'distribute'
                  && txHistory[h].round == round
                  && txHistory[h].lotterySCAddr == lotterySCAddr) {
                  bHave = true;
                  break;
                }
              }

              if (!bHave) {
                this.addTransactionHistory({
                  lotterySCAddr,
                  key: addrTotal[addr].rounds[round].key,
                  time: addrTotal[addr].rounds[round].time,
                  address: address.toLowerCase(),
                  round: round,
                  amount: addrTotal[addr].rounds[round].amount.toFixed(2),
                  type: 'Distribute',
                  result: 'Done',
                });
              }
            }
          }
        }

        this.addRandomHistory(randomHistories);
      }

      this.setRandomHistoryStartBlock(blockNumber);
      this.randomHistoryScanStart = false;
    } catch (err) {
      console.log(err);
      this.randomHistoryScanStart = false;
    }

    this.setState({ randomSpinning: false });
  }

  getUpDownRoundRange = () => {
    let currentRound = 0;
    if (this.state.trendInfo) {
      currentRound = this.state.trendInfo.round;
    }

    let startRound = currentRound - 29 > 0 ? (currentRound - 29) : 0;
    if (this.state.trendHistory && this.state.trendHistory.length > 0) {
      startRound = Number(this.state.trendHistory[this.state.trendHistory.length - 1].round) + 1;
    }

    if (startRound >= currentRound) {
      return [];
    }

    let roundArray = [];
    for (let i = startRound; i < currentRound; i++) {
      roundArray.push(i);
    }
    return roundArray;
  }

  getRandomRoundRange = () => {
    let currentRound = 0;
    if (this.state.trendInfo) {
      currentRound = this.state.trendInfo.lotteryRound;
    }
    let startRound = currentRound - 7 > 0 ? (currentRound - 7) : 0;
    let maxKey = -1;
    if (this.state.lotteryHistory && currentRound > 0) {
      for (var i in this.state.lotteryHistory) {
        if (Number(i) > maxKey) {
          maxKey = Number(i);
        }
      }
      startRound = maxKey + 1;
    }

    if (startRound >= currentRound) {
      return [];
    }

    let roundArray = [];
    for (let i = startRound; i < currentRound; i++) {
      roundArray.push(i);
    }
    return roundArray;
  }

  getRandomHistoryStartBlock = () => {
    let startBlock = window.localStorage.getItem(storagePrefix + 'RandomHistoryStartBlock');
    if (startBlock && startBlock.length > 0) {
      return Number(startBlock);
    }

    let defaultStartBlock = 6000000;
    return defaultStartBlock;
  }

  setRandomHistoryStartBlock = (blockNumber) => {
    window.localStorage.setItem(storagePrefix + 'RandomHistoryStartBlock', blockNumber.toString());
  }

  addTransactionHistory = (singleHistory) => {
    const stateHistory = this.state.transactionHistory;
    let history = [];
    if (stateHistory) {
      history = stateHistory.slice();
    }
    history.push(singleHistory);
    this.setState({ transactionHistory: history });
    window.localStorage.setItem(storagePrefix + 'transactionHistory', JSON.stringify(history));
    this.getUserPanalInfo();
  }

  getTransactionHistory = () => {
    let transactionHistory = window.localStorage.getItem(storagePrefix + 'transactionHistory');
    if (transactionHistory) {
      return JSON.parse(transactionHistory);
    }

    return [];
  }

  getLotteryHistory = () => {
    let randomHistory = window.localStorage.getItem(storagePrefix + 'randomHistory');
    if (randomHistory) {
      return JSON.parse(randomHistory);
    }

    return {};
  }

  flushTransactionHistory = async () => {
    if (!this.getDataWait(() => { return this.state.trendInfo })) {
      return;
    }

    if (!this.getDataWait(() => { return this.state.trendHistory })) {
      return;
    }

    let history = this.getTransactionHistory();
    let length = history.length;
    let bChanged = false;
    for (let i = 0; i < length; i++) {
      if (history[i].result === 'To be settled') {
        if ((history[i].type.toLowerCase() === 'up' || history[i].type.toLowerCase() === 'down')
          && history[i].round < this.state.trendInfo.round) {
          for (let m = 0; m < this.state.trendHistory.length; m++) {
            if (this.state.trendHistory[m].round == history[i].round) {
              if ((history[i].type.toLowerCase() == this.state.trendHistory[m].result)
                || (this.state.trendHistory[m].result === 'draw')
                || (this.isLoseRound(history[i].type.toLowerCase(), this.state.trendHistory[m].upAmount, this.state.trendHistory[m].downAmount))) {
                history.push({
                  key: history[i].key + '_return',
                  time: new Date().format("yyyy-MM-dd hh:mm:ss"),
                  address: history[i].address,
                  round: history[i].round,
                  amount: this.getPayAmount(-1 * (history[i].amount), this.state.trendHistory[m]),
                  type: 'Return',
                  result: 'Done',
                })
              }
              history[i].result = 'Done';
              bChanged = true;
              break;
            }
          }
        }
      }
    }

    if (bChanged) {
      this.setState({ transactionHistory: history });
      window.localStorage.setItem(storagePrefix + 'transactionHistory', JSON.stringify(history));
    }
  }

  isLoseRound = (type, upAmount, downAmount) => {
    if (type == 'up' && downAmount == 0) {
      return true;
    }

    if (type == 'down' && upAmount == 0) {
      return true;
    }

    return false;
  }

  getPayAmount = (amount, trendHistoryOne) => {
    if (trendHistoryOne.result === 'draw') {
      return amount * 0.9
    }

    if (trendHistoryOne.result === 'up' && trendHistoryOne.upAmount == 0) {
      return amount * 0.9
    }

    if (trendHistoryOne.result === 'down' && trendHistoryOne.downAmount == 0) {
      return amount * 0.9
    }

    if (trendHistoryOne.result === 'up') {
      let value = (trendHistoryOne.upAmount + trendHistoryOne.downAmount) * 0.9 / trendHistoryOne.upAmount * amount;
      return Number(value.toFixed(1))
    }

    if (trendHistoryOne.result === 'down') {
      let value = (trendHistoryOne.upAmount + trendHistoryOne.downAmount) * 0.9 / trendHistoryOne.downAmount * amount;
      return Number(value.toFixed(1))
    }
    return 0
  }

  getDataWait = async (dataFunc) => {
    let max = 60;
    let i = 0;
    while (i < max) {
      if (dataFunc()) {
        return dataFunc();
      }
      await sleep(1000);
      i++;
    }
    return undefined
  }

  watchTransactionStatus = (txID, callback) => {
    const getTransactionStatus = async () => {
      const tx = await getTransactionReceipt(txID);
      if (!tx) {
        window.setTimeout(() => getTransactionStatus(txID), 3000);
      } else if (callback) {
        callback(Number(tx.status) === 1);
      } else {
        window.alertAntd('success');
      }
    };
    window.setTimeout(() => getTransactionStatus(txID), 3000);
  };

  estimateSendGas = async (value, selectUp) => {
    let lotterySC = this.lotterySC;
    try {
      let ret = await lotterySC.methods.stakeIn(selectUp).estimateGas({ gas: 10000000, value })
      if (ret == 10000000) {
        return -1;
      }
      return '0x' + (ret + 30000).toString(16);
    } catch (err) {
      console.log(err);
      return -1;
    }
  }

  sendTransaction = async (amount, selectUp) => {
    const { selectedAccount, selectedWallet, wanBalance } = this.props;
    const address = selectedAccount ? selectedAccount.get('address') : null;

    if (wanBalance <= amount) {
      window.alertAntd('Out of balance.');
      return false;
    }

    if (!address || address.length < 20) {
      window.alertAntd('Please select a wallet address first.');
      return false
    }
    const value = this.web3.utils.toWei(amount.toString());

    let params = {
      to: lotterySCAddr,
      data: selectUp ? '0xf4ee1fbc0000000000000000000000000000000000000000000000000000000000000001' : '0xf4ee1fbc0000000000000000000000000000000000000000000000000000000000000000',
      value,
      gasPrice: "0x29E8D60800",
      // gasLimit: "0x87A23",
    };

    if (selectedWallet.type() == "EXTENSION") {
      params.gas = await this.estimateSendGas(value, selectUp);
    } else {
      params.gasLimit = await this.estimateSendGas(value, selectUp);
      // params.gasPrice = "0x2540BE400";
    }
    if (params.gasLimit == -1) {
      window.alertAntd('Estimate Gas Error. Maybe out of time range.');
      return false;
    }

    try {
      let transactionID = await selectedWallet.sendTransaction(params);
      let round = this.state.trendInfo.round;
      this.watchTransactionStatus(transactionID, (ret) => {
        if (ret) {
          this.addTransactionHistory({
            key: transactionID,
            time: new Date().format("yyyy-MM-dd hh:mm:ss"),
            address,
            round,
            amount: amount * -1,
            type: selectUp ? 'Up' : 'Down',
            result: 'To be settled',
          });
        }
      });

      return transactionID;
    } catch (err) {
      console.log(err);
      window.alertAntd(err);
      return false;
    }
  }

  getAmountInfo = () => {
    let history = this.getTransactionHistory();
    let length = history.length;
    let upAmount = Number(0)
    let downAmount = Number(0)
    for (let i = 0; i < length; i++) {
      if (history[i].result === 'To be settled' && history[i].round === this.state.trendInfo.round) {
        if (history[i].type.toLowerCase() === 'up') {
          upAmount += -1 * Number(history[i].amount);
        }

        if (history[i].type.toLowerCase() === 'down') {
          downAmount += -1 * Number(history[i].amount);
        }
      }
    }

    let upOdds = Number(this.state.trendInfo.upPoolAmount) === 0 ? "NA" : (Number(this.state.trendInfo.downPoolAmount) / Number(this.state.trendInfo.upPoolAmount) * 0.9).toFixed(1);
    let downOdds = Number(this.state.trendInfo.downPoolAmount) === 0 ? "NA" : (Number(this.state.trendInfo.upPoolAmount) / Number(this.state.trendInfo.downPoolAmount) * 0.9).toFixed(1);
    let expectReturn = Math.abs(upAmount * Number(upOdds) - downAmount * Number(downOdds)).toFixed(1);

    this.setState({
      amountInfo: {
        upAmount,
        downAmount,
        upOdds,
        downOdds,
        expectReturn,
      }
    });
  }

  getLastRoundAmountInfo = () => {
    let history = this.getTransactionHistory();
    let trendHistory = this.state.trendHistory;
    let length = history.length;
    let upAmount = Number(0);
    let downAmount = Number(0);
    let winSide = 'up';
    let upPoolAmount = Number(0);
    let downPoolAmount = Number(0);

    for (let i = 0; i < length; i++) {
      if (Number(history[i].round) === (Number(this.state.trendInfo.round) - 1)) {
        if (history[i].type.toLowerCase() === 'up') {
          upAmount += -1 * Number(history[i].amount);
        }

        if (history[i].type.toLowerCase() === 'down') {
          downAmount += -1 * Number(history[i].amount);
        }
      }
    }

    for (var i in trendHistory) {
      if (Number(trendHistory[i].round) === (Number(this.state.trendInfo.round) - 1)) {
        if (trendHistory[i].openPrice > trendHistory[i].closePrice) {
          winSide = 'up';
        } else if (trendHistory[i].openPrice < trendHistory[i].closePrice) {
          winSide = 'down';
        } else {
          winSide = 'draw';
        }

        upPoolAmount = trendHistory[i].upAmount;
        downPoolAmount = trendHistory[i].downAmount;
        break;
      }
    }

    let upOdds = Number(upPoolAmount) === 0 ? "NA" : (Number(downPoolAmount) / Number(upPoolAmount) * 0.9).toFixed(1);
    let downOdds = Number(downPoolAmount) === 0 ? "NA" : (Number(upPoolAmount) / Number(downPoolAmount) * 0.9).toFixed(1);
    let expectReturn = (winSide === 'up') ? (upAmount * Number(upOdds) - downAmount * Number(downOdds)) : ((winSide === 'down') ? (downAmount * Number(downOdds) - upAmount * Number(upOdds)) : (upAmount + downAmount) * 0.9);
    expectReturn = expectReturn >= 0 ? "+" + expectReturn.toFixed(2) : expectReturn.toFixed(2);
    this.setState({
      lastRoundAmountInfo: {
        upAmount,
        downAmount,
        upOdds,
        downOdds,
        expectReturn,
      }
    });
  }

  getLastLotteryInfo = () => {
    let lastRound = 0;
    if (this.state.trendInfo) {
      lastRound = this.state.trendInfo.lotteryRound - 1;
      if (lastRound < 0) {
        return;
      }
    }

    let lastRoundLotteryInfo = {
      eachAmount: 0,
      winTimes: 0,
      totalWin: 0,
    }

    for (var i in this.state.lotteryHistory) {
      if (i.toString() === lastRound.toString()) {
        let winners = this.state.lotteryHistory[i];
        lastRoundLotteryInfo.eachAmount = Number(winners[0].amountPay).toFixed(2);
        break;
      }
    }

    let history = this.getTransactionHistory();
    let length = history.length;
    let m = 0;
    for (m = 0; m < length; m++) {
      if (history[m].type.toLowerCase() === 'distribute' && history[m].round.toString() === lastRound.toString()) {
        lastRoundLotteryInfo.totalWin = Number(history[m].amount).toFixed(2);
        break;
      }
    }

    lastRoundLotteryInfo.winTimes = Number(lastRoundLotteryInfo.totalWin / lastRoundLotteryInfo.eachAmount).toFixed(0)

    this.setState({ lastRoundLotteryInfo });
  }

  getTotalHistoryInfo = () => {
    let totalHistory = {
      totalBuy: 0,
      inReturn: 0,
      fromLottery: 0,
      totalAmount: 0
    }
    let history = this.getTransactionHistory();
    let length = history.length;
    let m = 0;
    for (m = 0; m < length; m++) {
      if (history[m].type.toLowerCase() === 'distribute') {
        totalHistory.fromLottery += Number(history[m].amount);
      }

      if (history[m].type.toLowerCase() === 'up') {
        totalHistory.totalBuy += Number(history[m].amount);
      }

      if (history[m].type.toLowerCase() === 'down') {
        totalHistory.totalBuy += Number(history[m].amount);
      }

      if (history[m].type.toLowerCase() === 'return') {
        totalHistory.inReturn += Number(history[m].amount);
      }
    }

    totalHistory.totalAmount = (totalHistory.totalBuy + totalHistory.inReturn + totalHistory.fromLottery).toFixed(2);

    totalHistory.totalBuy = Number(totalHistory.totalBuy).toFixed(0);
    totalHistory.inReturn = Number(totalHistory.inReturn).toFixed(2);
    totalHistory.fromLottery = Number(totalHistory.fromLottery).toFixed(2);

    this.setState({ totalHistory });
  }

  getUserPanalInfo = () => {
    this.getAmountInfo();
    this.getLastRoundAmountInfo();
    this.getLastLotteryInfo();
    this.getTotalHistoryInfo();
  }

  render() {
    return (
      <div className={style.app}>
        <Panel walletButton={WalletButtonLong} trendInfo={this.state.trendInfo} amountInfo={this.state.amountInfo} sendTransaction={this.sendTransaction} watchTransactionStatus={this.watchTransactionStatus} symbol={'BTC'} unit={'USD / BTC'} />
        <TrendHistory trendHistory={this.state.trendHistory} trendInfo={this.state.trendInfo} />
        <UserPanel lastRoundAmountInfo={this.state.lastRoundAmountInfo} totalHistory={this.state.totalHistory} lastRoundLotteryInfo={this.state.lastRoundLotteryInfo} />
        <TransactionHistory transactionHistory={this.state.transactionHistory} />
        <DistributionHistory lotteryHistory={this.state.lotteryHistory} spinning={this.state.randomSpinning} />
      </div>
    );
  }
}

export default connect(state => {
  const selectedAccountID = state.WalletReducer.get('selectedAccountID');
  return {
    selectedAccount: getSelectedAccount(state),
    selectedWallet: getSelectedAccountWallet(state),
    networkId: state.WalletReducer.getIn(['accounts', selectedAccountID, 'networkId']),
    selectedAccountID,
    wanBalance: toUnitAmount(state.WalletReducer.getIn(['accounts', selectedAccountID, 'balance']), 18),
  }
})(IndexPage);
