import React, { useState } from 'react';

const TradingSystemAnalyzer = () => {
  const [isReactUsed] = useState(true);
  // Function to format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };
  
  const [inputs, setInputs] = useState({
    avgWin: 200,
    avgLoss: 100,
    winRate: 50,
    accountSize: 10000,
    numberOfTrades: 100,
    isPropFirm: false,
    maxDrawdown: 5,
    maxDailyLoss: 2,
    tradesPerDay: 5,
    showBreachDetails: true
  });
  
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInputs({
      ...inputs,
      [name]: type === 'checkbox' ? checked : parseFloat(value)
    });
  };
  
  const runSimulation = () => {
    setIsLoading(true);
    
    // Use setTimeout to prevent UI freezing during calculation
    setTimeout(() => {
      const { 
        avgWin, 
        avgLoss, 
        winRate, 
        accountSize, 
        numberOfTrades,
        isPropFirm,
        maxDrawdown,
        maxDailyLoss,
        tradesPerDay
      } = inputs;
      
      // Calculate risk-reward ratio and risk percentage
      const riskRewardRatio = avgWin / avgLoss;
      const riskPercentage = (avgLoss / accountSize) * 100;
      
      // Initialize simulation variables
      const initialBalance = accountSize;
      const fixedRiskAmount = initialBalance * (riskPercentage / 100);
      
      let balance = initialBalance;
      let equity = [balance];
      let drawdowns = [];
      let currentDrawdown = 0;
      let maxDrawdownInSim = 0;
      let peakBalance = balance;
      let winCount = 0;
      let lossCount = 0;
      let profits = 0;
      let losses = 0;
      let breakEvenTrade = -1;
      
      // Variables for tracking prop firm rules
      let dayCount = 1; // Start with day 1
      let tradeInDay = 0;
      let dayStartBalance = initialBalance;
      let dailyPnL = 0;
      let isAccountBlown = false;
      let totalDrawdown = 0; // Tracks cumulative drawdown from daily losses
      let dailyLossBreaches = 0;
      let maxDrawdownBreaches = 0;
      
      // Additional tracking variables
      let consecutiveLossDays = 0;
      let maxConsecutiveLossDays = 0;
      let actualTradesTaken = 0; // Count actual trades taken
      
      // Track daily performance for breach analysis
      let dailyLogs = [];
      let currentDayLog = {
        day: 1,
        trades: [],
        startBalance: initialBalance,
        endBalance: initialBalance,
        dailyPnL: 0,
        dailyPnLPercent: 0,
        dailyLossBreach: false,
        cumulativeDrawdown: 0,
        maxDrawdownBreach: false
      };
      
      // Run simulation
      for (let i = 0; i < numberOfTrades; i++) {
        // Skip trades after account is blown (only in prop firm mode)
        if (isPropFirm && isAccountBlown) {
          continue;
        }
        
        actualTradesTaken++;
        
        // Log trade details
        const tradeNumber = actualTradesTaken;
        const isWin = Math.random() * 100 < winRate;
        let tradeResult = 0;
        
        if (isWin) {
          const profit = fixedRiskAmount * riskRewardRatio;
          balance += profit;
          profits += profit;
          winCount++;
          tradeResult = profit;
          
          if (isPropFirm) {
            dailyPnL += profit;
          }
        } else {
          balance -= fixedRiskAmount;
          losses += fixedRiskAmount;
          lossCount++;
          tradeResult = -fixedRiskAmount;
          
          if (isPropFirm) {
            dailyPnL -= fixedRiskAmount;
          }
        }
        
        // Add trade to daily log
        currentDayLog.trades.push({
          tradeNumber,
          isWin,
          amount: tradeResult,
          balanceAfter: balance
        });
        
        // Track equity curve
        equity.push(balance);
        
        // Check for break-even point
        if (breakEvenTrade === -1 && balance >= initialBalance && equity[equity.length - 2] < initialBalance) {
          breakEvenTrade = i;
        }
        
        // Update peak balance and calculate drawdown
        if (balance > peakBalance) {
          peakBalance = balance;
          currentDrawdown = 0;
        } else {
          currentDrawdown = (peakBalance - balance) / peakBalance * 100;
          if (currentDrawdown > maxDrawdownInSim) {
            maxDrawdownInSim = currentDrawdown;
          }
        }
        
        drawdowns.push(currentDrawdown);
        
        // Increment trade in day counter
        if (isPropFirm && tradesPerDay > 0) {
          tradeInDay++;
        }
        
        // Daily loss check after each trade (for prop firm mode)
        if (isPropFirm && dailyPnL < 0) {
          const dailyLossPercent = (Math.abs(dailyPnL) / dayStartBalance) * 100;
          
          // If daily loss exceeds limit, halt trading for the day
          if (dailyLossPercent > maxDailyLoss) {
            dailyLossBreaches++;
            
            // Log the daily loss breach
            currentDayLog.dailyLossBreach = true;
            
            // Add this day's loss to cumulative drawdown
            totalDrawdown += dailyLossPercent;
            currentDayLog.cumulativeDrawdown = totalDrawdown;
            
            // Check if exceeds max drawdown - immediate challenge failure
            if (totalDrawdown > maxDrawdown) {
              maxDrawdownBreaches = 1; // Can only have 1 breach (challenge fails immediately)
              isAccountBlown = true;  // Account blown when cumulative drawdown exceeds max
              currentDayLog.maxDrawdownBreach = true;
            }
            
            // Skip to next day
            tradeInDay = tradesPerDay;
            // We'll process end-of-day in next loop iteration
            
            // Track consecutive loss days
            consecutiveLossDays++;
            if (consecutiveLossDays > maxConsecutiveLossDays) {
              maxConsecutiveLossDays = consecutiveLossDays;
            }
          }
        }
        
        // End of day logic - reset daily tracking
        if (isPropFirm && tradesPerDay > 0 && tradeInDay >= tradesPerDay) {
          // For normal days (no daily loss breach), check if we need to add to drawdown
          if (dailyPnL < 0 && Math.abs(dailyPnL) / dayStartBalance * 100 <= maxDailyLoss) {
            const dailyLossPercent = (Math.abs(dailyPnL) / dayStartBalance) * 100;
            totalDrawdown += dailyLossPercent;
            currentDayLog.cumulativeDrawdown = totalDrawdown;
            
            // Track consecutive loss days
            consecutiveLossDays++;
            if (consecutiveLossDays > maxConsecutiveLossDays) {
              maxConsecutiveLossDays = consecutiveLossDays;
            }
          } else if (dailyPnL >= 0) {
            // Reset consecutive loss days on profitable day
            consecutiveLossDays = 0;
          }
          
          // Check if total drawdown exceeds max allowed - immediate challenge failure
          if (totalDrawdown > maxDrawdown && maxDrawdownBreaches === 0) {
            maxDrawdownBreaches = 1; // Can only have 1 breach (challenge fails immediately)
            isAccountBlown = true;
            currentDayLog.maxDrawdownBreach = true;
          }
          
          // Finalize current day log
          currentDayLog.endBalance = balance;
          currentDayLog.dailyPnL = dailyPnL;
          currentDayLog.dailyPnLPercent = (dailyPnL / dayStartBalance) * 100;
          dailyLogs.push({...currentDayLog}); // Clone to avoid reference issues
          
          // Reset daily trackers
          dayCount++;
          tradeInDay = 0;
          dayStartBalance = balance;
          dailyPnL = 0;
          
          // Create new day log
          currentDayLog = {
            day: dayCount,
            trades: [],
            startBalance: balance,
            endBalance: balance,
            dailyPnL: 0,
            dailyPnLPercent: 0,
            dailyLossBreach: false,
            cumulativeDrawdown: totalDrawdown,
            maxDrawdownBreach: false
          };
        }
      }
      
      // Process remaining day if there are trades in the last day
      if (isPropFirm && tradesPerDay > 0 && tradeInDay > 0) {
        // Calculate remaining day's drawdown
        if (dailyPnL < 0) {
          const dailyLossPercent = (Math.abs(dailyPnL) / dayStartBalance) * 100;
          
          if (dailyLossPercent > maxDailyLoss) {
            dailyLossBreaches++;
            currentDayLog.dailyLossBreach = true;
            totalDrawdown += dailyLossPercent;
          } else {
            totalDrawdown += dailyLossPercent;
          }
          
          currentDayLog.cumulativeDrawdown = totalDrawdown;
          
          // Check if total drawdown exceeds max allowed - immediate challenge failure
          if (totalDrawdown > maxDrawdown && maxDrawdownBreaches === 0) {
            maxDrawdownBreaches = 1;
            currentDayLog.maxDrawdownBreach = true;
          }
        }
        
        // Finalize current day log
        currentDayLog.endBalance = balance;
        currentDayLog.dailyPnL = dailyPnL;
        currentDayLog.dailyPnLPercent = (dailyPnL / dayStartBalance) * 100;
        dailyLogs.push({...currentDayLog}); // Clone to avoid reference issues
      }
      
      // Calculate expectancy
      const expectedWin = (winRate / 100) * riskRewardRatio;
      const expectedLoss = (1 - winRate / 100) * 1;
      const expectancy = expectedWin - expectedLoss;
      
      // Calculate average trade in dollars and percentage
      const averageTradeAmount = actualTradesTaken > 0 ? (profits - losses) / actualTradesTaken : 0;
      const averageTradePercent = (averageTradeAmount / accountSize) * 100;
      
      // Calculate final profit/loss
      const totalReturn = ((balance - accountSize) / accountSize) * 100;
      const netProfit = balance - accountSize;
      
      // Find the breach day (if any)
      const breachDay = dailyLogs.find(day => day.maxDrawdownBreach);
      
      // Set prop firm stats
      const propFirmStats = isPropFirm ? {
        maxDrawdownBreaches: maxDrawdownBreaches,
        dailyLossBreaches: dailyLossBreaches,
        cumulativeDrawdown: totalDrawdown,
        maxConsecutiveLossDays: maxConsecutiveLossDays,
        actualTradeCount: actualTradesTaken,
        actualDaysCount: dayCount,
        tradesPerDayTarget: tradesPerDay,
        avgTradesPerDay: dayCount > 0 ? actualTradesTaken / dayCount : 0,
        dailyLogs: dailyLogs,
        breachDay: breachDay,
        maxDrawdownLimit: maxDrawdown
      } : null;
      
      setResults({
        finalBalance: balance,
        maxDrawdown: maxDrawdownInSim,
        expectancy,
        averageTradeAmount,
        averageTradePercent,
        totalReturn,
        netProfit,
        equity,
        drawdowns,
        winCount,
        lossCount,
        fixedRiskAmount,
        breakEvenTrade,
        riskRewardRatio,
        riskPercentage,
        propFirmStats,
        isPropFirm,
        actualTradesTaken
      });
      
      setIsLoading(false);
    }, 0);
  };
  
  return (
    <div className="w-full max-w-4xl mx-auto p-4 bg-gray-50 rounded-lg shadow">
      <h1 className="text-2xl font-bold text-center mb-6">Trading System Analyzer (Non-Compounding)</h1>
      
      <div className="mb-6 bg-white p-4 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Trading Parameters</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Average Win ($)
            </label>
            <input
              type="number"
              name="avgWin"
              value={inputs.avgWin}
              onChange={handleInputChange}
              min="1"
              step="1"
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Average Loss ($)
            </label>
            <input
              type="number"
              name="avgLoss"
              value={inputs.avgLoss}
              onChange={handleInputChange}
              min="1"
              step="1"
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Win Rate (%)
            </label>
            <input
              type="number"
              name="winRate"
              value={inputs.winRate}
              onChange={handleInputChange}
              min="1"
              max="99"
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Size ($)
            </label>
            <input
              type="number"
              name="accountSize"
              value={inputs.accountSize}
              onChange={handleInputChange}
              min="100"
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Trades
          </label>
          <input
            type="number"
            name="numberOfTrades"
            value={inputs.numberOfTrades}
            onChange={handleInputChange}
            min="1"
            max="10000"
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="md:col-span-2">
          <div className="flex items-center mb-2">
            <input
              type="checkbox"
              id="propFirmCheckbox"
              name="isPropFirm"
              checked={inputs.isPropFirm}
              onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="propFirmCheckbox" className="ml-2 block text-sm font-medium text-gray-700">
              Enable Prop Firm Rules
            </label>
          </div>
        </div>
        
        {inputs.isPropFirm && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Drawdown Allowed (%)
              </label>
              <input
                type="number"
                name="maxDrawdown"
                value={inputs.maxDrawdown}
                onChange={handleInputChange}
                min="0.1"
                max="100"
                step="0.1"
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Daily Loss Allowed (%)
              </label>
              <input
                type="number"
                name="maxDailyLoss"
                value={inputs.maxDailyLoss}
                onChange={handleInputChange}
                min="0.1"
                max="100"
                step="0.1"
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trades Per Day
              </label>
              <input
                type="number"
                name="tradesPerDay"
                value={inputs.tradesPerDay}
                onChange={handleInputChange}
                min="1"
                max="100"
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Show Breach Details
              </label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="showBreachDetailsCheckbox"
                  name="showBreachDetails"
                  checked={inputs.showBreachDetails}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-xs text-gray-500">
                  (Shows details when drawdown limit is exceeded)
                </span>
              </div>
            </div>
          </>
        )}
      </div>
      <button
        onClick={runSimulation}
        disabled={isLoading}
        className={`mt-4 ${isLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded transition-colors w-full md:w-auto`}
      >
        {isLoading ? 'Running Simulation...' : 'Run Simulation'}
      </button>
    </div>
    
    {results && (
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">
          Simulation Results
          {results.isPropFirm && <span className="ml-2 text-sm font-normal text-blue-600">(Prop Firm Rules Applied)</span>}
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-lg mb-2">Performance Metrics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Starting Balance:</span>
                <span className="font-medium">{formatCurrency(inputs.accountSize)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Final Balance:</span>
                <span className="font-medium">{formatCurrency(results.finalBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Net Profit:</span>
                <span className={`font-medium ${results.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(results.netProfit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Fixed Risk Amount:</span>
                <span className="font-medium">{formatCurrency(results.fixedRiskAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Risk-Reward Ratio:</span>
                <span className="font-medium">{results.riskRewardRatio.toFixed(2)}:1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Risk per Trade (%):</span>
                <span className="font-medium">{results.riskPercentage.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Wins / Losses:</span>
                <span className="font-medium">{results.winCount} / {results.lossCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Trades Taken:</span>
                <span className="font-medium">{results.actualTradesTaken} of {inputs.numberOfTrades}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-lg mb-2">Risk Analysis</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Max Drawdown (Peak-to-Trough):</span>
                <span className="font-medium text-red-600">{results.maxDrawdown.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">System Expectancy:</span>
                <span className={`font-medium ${results.expectancy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {results.expectancy.toFixed(2)}R
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Average Trade Amount:</span>
                <span className={`font-medium ${results.averageTradeAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(results.averageTradeAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Trade (% of initial):</span>
                <span className={`font-medium ${results.averageTradePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {results.averageTradePercent.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Return:</span>
                <span className={`font-medium ${results.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {results.totalReturn.toFixed(2)}%
                </span>
              </div>
              
              {results.propFirmStats && (
                <>
                  <div className="pt-2 border-t border-gray-200 mt-2">
                    <span className="font-medium text-blue-600">Prop Firm Analysis:</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Max Drawdown Breach:</span>
                    <span className="font-medium text-red-600">
                      {results.propFirmStats.maxDrawdownBreaches > 0 ? "Yes (Challenge Failed)" : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Daily Loss Breaches:</span>
                    <span className="font-medium text-red-600">
                      {results.propFirmStats.dailyLossBreaches}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs">
                      (Trading halted on breach, drawdown accumulates)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cumulative Drawdown:</span>
                    <span className="font-medium">
                      {results.propFirmStats.cumulativeDrawdown.toFixed(2)}%
                    </span>
                    <span className="text-xs text-gray-500">
                      (Limit: {results.propFirmStats.maxDrawdownLimit}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Max Consecutive Loss Days:</span>
                    <span className="font-medium">
                      {results.propFirmStats.maxConsecutiveLossDays}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Trading Days:</span>
                    <span className="font-medium">
                      {results.propFirmStats.actualDaysCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Trades Taken:</span>
                    <span className="font-medium">
                      {results.propFirmStats.actualTradeCount} of {inputs.numberOfTrades}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Trades Per Day:</span>
                    <span className="font-medium">
                      {results.propFirmStats.avgTradesPerDay.toFixed(1)} 
                      <span className="text-xs text-gray-500 ml-1">(Target: {results.propFirmStats.tradesPerDayTarget})</span>
                    </span>
                  </div>
                  
                  {inputs.showBreachDetails && results.propFirmStats.breachDay && (
                    <div className="mt-4 border-t border-gray-200 pt-2">
                      <div className="font-medium text-red-600 mb-2">Drawdown Breach Details:</div>
                      <div className="mb-1">
                        <span className="text-gray-600">Day when breach occurred: </span>
                        <span className="font-medium">Day {results.propFirmStats.breachDay.day}</span>
                      </div>
                      <div className="mb-1">
                        <span className="text-gray-600">Daily P&L that caused breach: </span>
                        <span className={`font-medium ${results.propFirmStats.breachDay.dailyPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(results.propFirmStats.breachDay.dailyPnL)} ({results.propFirmStats.breachDay.dailyPnLPercent.toFixed(2)}%)
                        </span>
                      </div>
                      <div className="text-sm mt-2 mb-1">Trades on breach day:</div>
                      <div className="bg-gray-100 p-2 rounded text-sm max-h-32 overflow-y-auto">
                        {results.propFirmStats.breachDay.trades.map((trade, i) => (
                          <div key={i} className="flex justify-between mb-1">
                            <span>Trade #{trade.tradeNumber}:</span>
                            <span className={trade.isWin ? 'text-green-600' : 'text-red-600'}>
                              {formatCurrency(trade.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Cumulative drawdown reached {results.propFirmStats.breachDay.cumulativeDrawdown.toFixed(2)}%, 
                        exceeding the {results.propFirmStats.maxDrawdownLimit}% limit
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="mb-6">
          <h3 className="font-medium text-lg mb-2">Equity Curve</h3>
          <div className="w-full h-64 bg-gray-100 relative p-2 border rounded">
            {results.equity.length > 1 && (
              <svg viewBox={`0 0 ${results.equity.length - 1} 100`} className="w-full h-full">
                {(() => {
                  const minEquity = Math.min(...results.equity);
                  const maxEquity = Math.max(...results.equity);
                  const range = maxEquity - minEquity;
                  const normalize = (val) => 100 - ((val - minEquity) / range) * 95;
                  
                  let path = `M 0 ${normalize(results.equity[0])}`;
                  for (let i = 1; i < results.equity.length; i++) {
                    path += ` L ${i-1} ${normalize(results.equity[i])}`;
                  }
                  
                  // Add a line showing initial balance (break-even line)
                  const initialBalanceLine = `M 0 ${normalize(inputs.accountSize)} L ${results.equity.length - 1} ${normalize(inputs.accountSize)}`;
                  
                  // Text label for break-even line
                  const breakEvenText = (
                    <text 
                      x="5" 
                      y={normalize(inputs.accountSize) - 3} 
                      fontSize="3" 
                      fill="green"
                    >
                      Break-even Line
                    </text>
                  );
                  
                  return (
                    <>
                      <path
                        d={path}
                        fill="none"
                        stroke="rgb(59, 130, 246)"
                        strokeWidth="0.5"
                      />
                      <path
                        d={initialBalanceLine}
                        fill="none"
                        stroke="rgba(34, 197, 94, 0.7)"
                        strokeWidth="0.6"
                        strokeDasharray="0.5,0.5"
                      />
                      {breakEvenText}
                    </>
                  );
                })()}
              </svg>
            )}
          </div>
        </div>
        
        <div>
          <h3 className="font-medium text-lg mb-2">Drawdown Chart</h3>
          <div className="w-full h-48 bg-gray-100 relative p-2 border rounded">
            {results.drawdowns.length > 0 && (
              <svg viewBox={`0 0 ${results.drawdowns.length} 100`} className="w-full h-full">
                {(() => {
                  const maxDrawdownVal = Math.max(...results.drawdowns, 5);
                  const normalize = (val) => (val / maxDrawdownVal) * 95;
                  
                  let path = `M 0 ${normalize(results.drawdowns[0])}`;
                  for (let i = 1; i < results.drawdowns.length; i++) {
                    path += ` L ${i} ${normalize(results.drawdowns[i])}`;
                  }
                  
                  return (
                    <>
                      <path
                        d={path}
                        fill="none"
                        stroke="rgb(220, 38, 38)"
                        strokeWidth="0.5"
                      />
                    </>
                  );
                })()}
              </svg>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
  );
};

export default TradingSystemAnalyzer;