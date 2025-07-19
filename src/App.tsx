import React, { useEffect, useState, useMemo } from 'react';
import { useTodoStore, initializeSync, shutdownSync, syncEngine, syncConfig } from './store/todoStore';
import { SurrealDBAdapter } from './adapters/SurrealDBAdapter';
import type { Todo } from './types';

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center space-y-4 py-16">
    <svg className="animate-spin h-16 w-16 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <div className="text-xl text-gray-800 font-semibold">Connecting to Database...</div>
    <p className="text-gray-500 text-center max-w-xs">We're setting up your offline-first experience. This may take a moment.</p>
  </div>
);

const EmptyState: React.FC = () => (
  <div className="text-center py-16 px-6 bg-gray-50/50 rounded-xl border-2 border-dashed">
    <div className="flex justify-center mb-6">
      <svg className="w-24 h-24 text-gray-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.5 9.5L14 7M19 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
        <path d="M12 5V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      </svg>
    </div>
    <h3 className="text-2xl font-semibold text-gray-800">All Tasks Completed!</h3>
    <p className="text-gray-500 mt-2">Looks like you're all caught up. Well done!</p>
  </div>
);


const DBStatusIndicator: React.FC<{ connected: boolean }> = ({ connected }) => {
  const statusColor = connected ? 'text-green-600' : 'text-red-600';
  const bgColor = connected ? 'bg-green-500' : 'bg-red-500';
  const statusText = connected ? 'Connected' : 'Disconnected';

  return (
    <div className={`flex items-center space-x-2.5 text-sm font-semibold ${statusColor}`}>
      <span className={`relative flex h-3 w-3`}>
        <span className={`${bgColor} absolute inline-flex h-full w-full rounded-full`}></span>
        {connected && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${bgColor} opacity-75`}></span>}
      </span>
      <span>DB: {statusText}</span>
    </div>
  );
};

const SyncStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState(syncEngine.getSyncStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(syncEngine.getSyncStatus());
    }, syncEngine.config.syncInterval);
    return () => clearInterval(interval);
  }, []);

  const statusColor = status.syncing ? 'text-blue-600' : (status.pending > 0 ? 'text-yellow-600' : 'text-green-600');
  const bgColor = status.syncing ? 'bg-blue-500' : (status.pending > 0 ? 'bg-yellow-500' : 'bg-green-500');
  const statusText = status.syncing ? 'Syncing...' : (status.pending > 0 ? `Pending (${status.pending})` : 'In Sync');

  return (
    <div className={`flex items-center space-x-2.5 text-sm font-semibold ${statusColor}`}>
      <span className={`relative flex h-3 w-3`}>
        <span className={`${bgColor} absolute inline-flex h-full w-full rounded-full`}></span>
        {status.syncing && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${bgColor} opacity-75`}></span>}
      </span>
      <span>Sync: {statusText}</span>
    </div>
  );
};

const TodoItem: React.FC<{ todo: Todo }> = ({ todo }) => {
  const { toggleTodo, deleteTodo } = useTodoStore.getState();
  const isCompleted = todo.completed;
  return (
    <div
      className={`
                group flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 
                shadow-sm transition-all duration-300 ease-in-out
                hover:shadow-lg hover:border-blue-400 hover:scale-[1.02] transform
                ${isCompleted ? 'opacity-60' : ''}
            `}
    >
      <div className="flex items-center flex-grow min-w-0">
        <input
          type="checkbox"
          checked={isCompleted}
          onChange={() => toggleTodo(todo.id!)}
          className="h-6 w-6 flex-shrink-0 cursor-pointer rounded-md border-2 border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-2 transition"
        />
        <span className={`ml-4 text-lg font-medium text-gray-800 truncate ${isCompleted ? 'line-through' : ''}`}>
          {todo.text}
        </span>
      </div>
      <button
        onClick={() => deleteTodo(todo.id!)}
        className="
                    ml-2 flex-shrink-0 p-2 rounded-full text-gray-400 opacity-0 group-hover:opacity-100 
                    transition-all duration-300
                    hover:bg-red-100 hover:text-red-600 hover:scale-110
                    focus:outline-none focus:opacity-100
                    focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        title="Delete Task"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default function App() {
  const [newTodoText, setNewTodoText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(false);
  const { todos, addTodo } = useTodoStore((state) => {
    return ({
      todos: state.todos,
      addTodo: state.addTodo
    })
  });


  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      setDbConnected(false);
      try {
        const adapterInstance = new SurrealDBAdapter(syncConfig);
        await initializeSync(adapterInstance);
        setDbConnected(adapterInstance.isConnected());
      } catch (error) {
        console.error("Fatal: Error initializing database or sync engine.", error);
        setDbConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      shutdownSync();
    };
  }, []);

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTodoText.trim();
    if (text && typeof addTodo === 'function') {
      try {
        addTodo(text);
        setNewTodoText('');
      } catch (error) {
        console.error('Error adding todo:', error);
      }
    }
  };

  const sortedTodos = useMemo(() =>
    [...todos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [todos]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-100 flex flex-col items-center justify-center p-4 font-sans antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `}</style>
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 p-6 sm:p-8">
          <div className="flex justify-between items-start mb-8">
            <h1 className="text-4xl font-bold text-gray-800 tracking-tight">My Tasks</h1>
            <div className="flex flex-col items-end space-y-2 bg-gray-100/50 p-3 rounded-lg border border-gray-200/50">
              <DBStatusIndicator connected={dbConnected} />
              <SyncStatusIndicator />
            </div>
          </div>

          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <form onSubmit={handleAddTodo} className="flex gap-3 mb-8">
                <input
                  type="text"
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  placeholder="Add a new task..."
                  className="flex-grow p-4 border-2 border-gray-200 bg-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  className="
                      flex-shrink-0 bg-blue-600 text-white px-5 py-3 rounded-xl font-semibold shadow-lg
                      hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      transition-all transform hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:bg-blue-400"
                  disabled={!newTodoText.trim()}
                >
                  <span className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add Task
                  </span>
                </button>
              </form>

              <div className="space-y-4">
                {todos.length === 0 ? (
                  <EmptyState />
                ) : (
                  sortedTodos.map((todo, i) => (
                    <TodoItem key={i} todo={todo} />
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <footer className="text-center mt-8 text-sm text-gray-500/80">
          <p>Offline-First Todo App with Zustand & SurrealDB</p>
        </footer>
      </div>
    </div>
  );
}
