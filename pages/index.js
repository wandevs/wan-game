import { connect } from "react-redux";
import { Component } from "../components/base";
import { Icon, message } from 'antd';
import BigNumber from 'bignumber.js';
import { Wallet, getSelectedAccount, WalletButton, WalletButtonLong, getSelectedAccountWallet, getTransactionReceipt } from "wan-dex-sdk-wallet";
import "wan-dex-sdk-wallet/index.css";
import randomAbi from "./abi/random";
import hydroAbi from "./abi/hydro";
import lotteryAbi from "./abi/lottery";
import style from './style.less';
import Panel from '../components/Panel';
import TrendHistory from '../components/TrendHistory';
import TransactionHistory from '../components/TransactionHistory';
import DistributionHistory from '../components/DistributionHistory';

const lotterySCAddr = '0xa843f035fd8d6b4cf4415f5910fb95ddfb6af328';

var Web3 = require("web3");

let debugStartTime = (Date.now() / 1000)

function alertAntd(info) {
  if (typeof (info) === "string") {
    message.success(info, 10);
  } else {
    if (info.toString().includes("Error")) {
      message.error(info.toString(), 10);
    } else if (info.hasOwnProperty('tip')) {
      message.info(info.tip, 5);
    } else {
      message.info(JSON.stringify(info), 10);
    }
  }
}

class IndexPage extends Component {
  constructor(props) {
    super(props);
    this.state = {};
    // window._nodeUrl = "https://demodex.wandevs.org:48545";
    window._nodeUrl = "https://mywanwallet.io/testnet";

    window.alertAntd = alertAntd;

    let trendStr = window.localStorage.getItem('currentTrend');
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

    let trendHistoryStr = window.localStorage.getItem('trendHistory');
    let trendHistory = [];
    if (trendHistoryStr) {
      trendHistory = JSON.parse(trendHistoryStr);
    }

    this.state = {
      trendInfo: trend,
      trendHistory: trendHistory,
      transactionHistory: this.getTransactionHistory(),
      lotteryHistory: this.getLotteryHistory(),
    }

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

  componentDidMount() {
    var web3 = new Web3();
    web3.setProvider(new Web3.providers.HttpProvider(window._nodeUrl));
    this.web3 = web3;

    this.updateTrendInfoFromNode();
    setInterval(this.updateTrendInfoFromNode, 5000);

    setInterval(this.updateTrendHistoryFromNode, 60 * 1000);
  }

  setTrendInfo = (trendInfo) => {
    let stateTrend = JSON.stringify(this.state.trendInfo);
    let inComeTrend = JSON.stringify(trendInfo);
    if (stateTrend !== inComeTrend) {
      this.setState({ trendInfo });
      window.localStorage.setItem('currentTrend', inComeTrend);
    }
  }

  updateTrendInfoFromNode = async () => {
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
    };

    let lotterySC = new this.web3.eth.Contract(lotteryAbi, lotterySCAddr);
    trend.round = Number(await lotterySC.methods.curUpDownRound().call());
    trend.lotteryRound = Number(await lotterySC.methods.curRandomRound().call());
    let upDownLotteryStartRN = Number(await lotterySC.methods.updownLotteryStartRN().call());
    let upDownLotteryStartTime = Number(await lotterySC.methods.upDownLotteryStartTime().call());
    trend.timeSpan = Number(await lotterySC.methods.upDownLotteryTimeCycle().call());
    trend.startTime = Number((upDownLotteryStartRN + trend.round) * trend.timeSpan) + Number(upDownLotteryStartTime);
    let feeRatio = Number(await lotterySC.methods.feeRatio().call());
    trend.stopBefore = Number(await lotterySC.methods.upDownLtrstopTimeSpanInAdvance().call());
    let roundInfo = await lotterySC.methods.updownGameMap(trend.round).call();
    trend.btcPriceStart = Number(roundInfo.openPrice) / 1e8;
    trend.upPoolAmount = Number(roundInfo.upAmount)/1e18;
    trend.downPoolAmount = Number(roundInfo.downAmount)/1e18;
    trend.randomPoolAmount = ((trend.upPoolAmount + trend.downPoolAmount) * (feeRatio/1000)).toFixed(1);
    let randomStartRN = Number(await lotterySC.methods.randomLotteryStartRN().call());
    let randomTimeCycle = Number(await lotterySC.methods.randomLotteryTimeCycle().call());
    let randomLotteryStartTime = Number(await lotterySC.methods.randomLotteryStartTime().call());
    trend.randomEndTime = Number((randomStartRN + trend.lotteryRound + 1) * randomTimeCycle) + Number(randomLotteryStartTime);

    this.setTrendInfo(trend);

    this.updateTrendHistoryFromNode();
    this.updateRandomHistoryFromNode();
  }

  setTrendHistory = (trendHistory) => {
    let stateValue = JSON.stringify(this.state.trendHistory);
    let inComeValue = JSON.stringify(trendHistory);
    if (stateValue !== inComeValue) {
      this.setState({ trendHistory });
      window.localStorage.setItem('trendHistory', inComeValue);
    }
  }

  updateTrendHistoryFromNode = async () => {
    try {
      let trendHistory = [];

      let roundArray = this.getUpDownRoundRange();
      if (roundArray.length === 0) {
        return;
      }

      let lotterySC = new this.web3.eth.Contract(lotteryAbi, lotterySCAddr);

      for (let i = 0; i < roundArray.length; i++) {
        let ret = await lotterySC.methods.updownGameMap(roundArray[i]).call();
        trendHistory.push({
          round: roundArray[i],
          startPrice: ret.openPrice,
          endPrice: ret.closePrice,
          result: (ret.openPrice > ret.closePrice) ? 'down' : 'up',
          upAmount: ret.upAmount,
          downAmount: ret.downAmount,
          feeTotal: ret.feeTotal,
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
    const stateHistory = this.state.lotteryHistory;
    let history = [];
    if (stateHistory) {
      history = stateHistory.slice();
    }
    for (let i = 0; i < randomHistories; i++) {
      history.push(singleRandomHistory);
    }
    this.setState({ transactionHistory: history });
    window.localStorage.setItem('randomHistory', JSON.stringify(history));
  }

  updateRandomHistoryFromNode = async () => {
    try {
      let randomHistories = {};

      let roundArray = this.getRandomRoundRange();
      if (roundArray.length === 0) {
        return;
      }

      let lotterySC = new this.web3.eth.Contract(lotteryAbi, lotterySCAddr);
      let blockNumber = await this.web3.eth.getBlockNumber();
      let events = await lotterySC.getPastEvents('RandomBingGo', {
        filter: { round: roundArray },
        fromBlock: this.getRandomHistoryStartBlock(),
        toBlock: blockNumber
      });

      if (events && events.length > 0) {
        for (let i = 0; i < events.length; i++) {
          if (!randomHistories[events[i].returnValues.round]) {
            randomHistories[events[i].returnValues.round] = [];
          }

          randomHistories[events[i].returnValues.round].push({
            round: events[i].returnValues.round,
            address: events[i].returnValues.staker,
            amountBuy: '--',
            amountPay: events[i].returnValues.prizeAmount,
          });
        }
      }

      this.addRandomHistory(randomHistories);
      this.setRandomHistoryStartBlock(blockNumber);
    } catch (err) {
      console.log(err);
    }
  }

  getUpDownRoundRange = () => {
    let currentRound = 1;
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
    let currentRound = 1;
    if (this.state.trendInfo) {
      currentRound = this.state.trendInfo.lotteryRound;
    }

    let startRound = currentRound - 7 > 0 ? (currentRound - 7) : 0;
    let maxKey = 1;
    if (this.state.lotteryHistory && this.state.lotteryHistory.length > 0 && startRound > 0) {
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
    let startBlock = window.localStorage.getItem('RandomHistoryStartBlock');
    if (startBlock && startBlock.length > 0) {
      return Number(startBlock);
    }

    let defaultStartBlock = 6000000;
    return defaultStartBlock;
  }

  setRandomHistoryStartBlock = (blockNumber) => {
    window.localStorage.setItem('RandomHistoryStartBlock', blockNumber.toString());
  }

  addTransactionHistory = (singleHistory) => {
    const stateHistory = this.state.transactionHistory;
    let history = [];
    if (stateHistory) {
      history = stateHistory.slice();
    }
    history.push(singleHistory);
    this.setState({ transactionHistory: history });
    window.localStorage.setItem('transactionHistory', JSON.stringify(history));
  }

  getTransactionHistory = () => {
    let transactionHistory = window.localStorage.getItem('transactionHistory');
    if (transactionHistory) {
      return JSON.parse(transactionHistory);
    }

    return [];
  }

  getLotteryHistory = () => {
    let randomHistory = window.localStorage.getItem('randomHistory');
    if (randomHistory) {
      return JSON.parse(randomHistory);
    }

    return {
      '0': [
        {
          time: '2020-01-14 17:46:39',
          address: '0x4cf0a877e906dead748a41ae7da8c220e4247d9e',
          amountBuy: '1000',
          amountPay: 100.1234,
        },
      ]
    };
  }

  flushTransactionHistory = () => {

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

  sendTransaction = async (amount, selectUp) => {
    const { selectedAccount, selectedWallet } = this.props;
    const address = selectedAccount ? selectedAccount.get('address') : null;
    console.log('address:', address, 'amount:', amount, 'selectUp:', selectUp);

    const value = new BigNumber(amount).multipliedBy(Math.pow(10, 18)).toString();

    let params = {
      to: lotterySCAddr,
      data: selectUp ? '0xf4ee1fbc0000000000000000000000000000000000000000000000000000000000000001' : '0xf4ee1fbc0000000000000000000000000000000000000000000000000000000000000000',
      value,
      // gasPrice: "0x2a600b9c00",
      // gas: "0x030d40",
    };

    try {
      let transactionID = await selectedWallet.sendTransaction(params);
      let round = this.state.currentRound;
      this.watchTransactionStatus(transactionID, (ret) => {
        if (ret) {
          this.addTransactionHistory({
            key: transactionID,
            time: new Date().format("yyyy-MM-dd hh:mm:ss"),
            address,
            round,
            amount: amount * -1,
            type: selectUp ? 'UP' : 'DOWN',
            result: 'Done',
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


  render() {
    return (
      <div className={style.app}>
        <div className={style.header}>
          <Wallet title="Wan Game" nodeUrl={window._nodeUrl} />
          <Icon className={style.logo} type="appstore" />
          <div className={style.title}>BTC</div>
          <WalletButton />
        </div>
        <Panel walletButton={WalletButtonLong} trendInfo={this.state.trendInfo} sendTransaction={this.sendTransaction} watchTransactionStatus={this.watchTransactionStatus} />
        <TrendHistory trendHistory={this.state.trendHistory} trendInfo={this.state.trendInfo} />
        <TransactionHistory transactionHistory={this.state.transactionHistory} />
        <DistributionHistory lotteryHistory={this.state.lotteryHistory} />
      </div>
    );
  }
}

export default connect(state => ({
  selectedAccount: getSelectedAccount(state),
  selectedWallet: getSelectedAccountWallet(state),
}))(IndexPage);


