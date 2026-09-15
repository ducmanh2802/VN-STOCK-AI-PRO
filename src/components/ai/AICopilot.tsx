import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Trash2,
  Bot,
  User,
  Lightbulb,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  TrendingUp,
  Activity,
  Layers,
} from 'lucide-react';
import { Button } from '../ui/Button';

interface AICopilotProps {
  isOpen: boolean;
  onClose: () => void;
  currentSymbol?: string;
  activeTab?: string;
  onSelectStock?: (symbol: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contextTag?: string;
  suggestedActions?: { label: string; action: () => void }[];
}

export const AICopilot: React.FC<AICopilotProps> = ({
  isOpen,
  onClose,
  currentSymbol,
  activeTab = 'dashboard',
  onSelectStock,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: `Xin chào! Tôi là AI Copilot của VN STOCK AI PRO. Tôi hỗ trợ phân tích định lượng, bóc tách báo cáo tài chính, giải thích khuyến nghị và mô hình rủi ro thị trường Việt Nam.\n\nBạn có thể hỏi tôi về diễn biến thị trường, mã ${
        currentSymbol || 'cổ phiếu'
      } hoặc chiến lược danh mục.`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Context-specific suggested prompts
  const getSuggestedPrompts = () => {
    if (currentSymbol) {
      return [
        `Phân tích định giá & biên an toàn DCF của ${currentSymbol}`,
        `Tại sao điểm AI Score của ${currentSymbol} lại ở mức này?`,
        `Các yếu tố rủi ro và xúc tác tăng giá của ${currentSymbol} là gì?`,
        `So sánh ${currentSymbol} với các doanh nghiệp cùng ngành`,
      ];
    }
    if (activeTab === 'risk-center' || activeTab === 'portfolio') {
      return [
        'Đánh giá mức độ tập trung và rủi ro danh mục hiện tại',
        'Khuyến nghị phân bổ vốn tối ưu theo Kelly / VaR',
        'Mô phỏng kịch bản thị trường điều chỉnh 5%',
      ];
    }
    if (activeTab === 'screener') {
      return [
        'Lọc cổ phiếu có ROE > 15%, P/E < 12 và dòng tiền dương',
        'Top cổ phiếu bứt phá đỉnh 52 tuần với thanh khoản đột biến',
      ];
    }
    return [
      'Tóm tắt xu hướng VN-INDEX và dòng tiền thị trường hôm nay',
      'Top 3 cơ hội đầu tư định lượng nổi bật nhất',
      'Đánh giá trạng thái vĩ mô và lãi suất điều hành',
    ];
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date(),
      contextTag: currentSymbol ? `Symbol: ${currentSymbol}` : `View: ${activeTab}`,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Send query to the backend API endpoint
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          context: {
            symbol: currentSymbol,
            tab: activeTab,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.reply || data.content || data.analysis || 'Không có phản hồi từ máy chủ.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const errJson = await response.json().catch(() => null);
        const errMsgText = errJson?.error || errJson?.message || `Lỗi máy chủ HTTP ${response.status}`;
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ **Không thể hoàn tất phản hồi từ AI Copilot**\n\n${errMsgText}\n\n*Hệ thống fail-closed không tạo số liệu giả lập khi dịch vụ phân tích AI không sẵn sàng.*`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ **Lỗi kết nối mạng tới AI Copilot**\n\n${err?.message || 'Không thể gửi yêu cầu tới máy chủ'}. Vui lòng kiểm tra kết nối và thử lại.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Lịch sử trò chuyện đã được làm mới. Hãy đặt câu hỏi cho AI Copilot!',
        timestamp: new Date(),
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-[#0E1522] border-l border-[#263244] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Copilot Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#263244] bg-[#111827]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-100 font-sans">
                AI Copilot
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                PRO INTEL
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {currentSymbol ? `Context: ${currentSymbol}` : `Context: ${activeTab.toUpperCase()}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleClearHistory}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#182231] rounded-lg transition-colors"
            title="Làm mới cuộc trò chuyện"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#182231] rounded-lg transition-colors"
            title="Đóng Copilot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Banner */}
      {currentSymbol && (
        <div className="px-4 py-2 bg-[#182231]/70 border-b border-[#263244] flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-indigo-300">
            <Activity className="w-3.5 h-3.5" />
            <span>Active Stock Context: <strong>{currentSymbol}</strong></span>
          </div>
          {onSelectStock && (
            <button
              onClick={() => onSelectStock(currentSymbol)}
              className="text-slate-400 hover:text-indigo-400 flex items-center gap-1 text-[11px]"
            >
              Xem chi tiết <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-400 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-xl p-3.5 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                    : 'bg-[#182231] text-slate-200 border border-[#263244] rounded-bl-none shadow-sm'
                }`}
              >
                {msg.contextTag && (
                  <div className="text-[10px] font-mono text-indigo-200/80 mb-1 border-b border-white/10 pb-1">
                    {msg.contextTag}
                  </div>
                )}
                <div className="whitespace-pre-line break-words text-xs sm:text-sm font-sans">
                  {msg.content}
                </div>
                <div
                  className={`mt-1.5 text-[10px] font-mono ${
                    isUser ? 'text-indigo-200 text-right' : 'text-slate-500'
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-slate-700/50 border border-slate-600/40 flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 justify-start items-center text-slate-400 text-xs font-mono">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-400 animate-pulse">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-[#182231] border border-[#263244] rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span>AI đang phân tích dữ liệu thị trường...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts */}
      <div className="px-4 py-2 border-t border-[#263244] bg-[#0B0F17]/50">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          <span>Gợi ý câu hỏi:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {getSuggestedPrompts().map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              className="text-left text-[11px] px-2.5 py-1 rounded-md bg-[#182231] hover:bg-[#1E293B] border border-[#263244] text-slate-300 hover:text-indigo-300 transition-colors line-clamp-1"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <div className="p-3.5 border-t border-[#263244] bg-[#111827]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              currentSymbol
                ? `Hỏi về ${currentSymbol}, định giá, rủi ro...`
                : 'Nhập câu hỏi phân tích chứng khoán...'
            }
            className="flex-1 px-3.5 py-2.5 bg-[#0B0F17] border border-[#263244] rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all font-sans"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="mt-1.5 text-[10px] text-center text-slate-500 font-mono">
          AI Copilot sử dụng mô hình ngôn ngữ & dữ liệu định lượng thời gian thực.
        </p>
      </div>
    </div>
  );
};
