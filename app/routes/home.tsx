import React, { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { Textarea } from "~/components/ui/textarea";
import { StatesSelector } from "../components/state-selector";

export function meta() {
  return [
    { title: "StateViz" },
    {
      name: "description",
      content:
        "A tool for visualizing how state changes as your program executes",
    },
  ];
}

type Mutation = 
  | { event: "SET_ADD" | "SET_DELETE"; name: string; key: string }
  | { event: "DICT_SET" | "DICT_DELETE"; name: string; key: string; value?: string }
  | { event: "ARRAY_PUSH"; name: string; value: number }
  | { event: "ARRAY_POP"; name: string }
  | { event: "VAR_SET" | "VAR_DELETE"; name: string; value?: string };

type StateEntry = {
  id: string;
  loc: string;
  mutations: Mutation[];
};

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

const EXAMPLE_STATE: StateEntry[] = [
  {
    id: generateId(),
    loc: "model.py:23",
    mutations: [
      {
        event: "SET_ADD",
        name: "divisible",
        key: "a",
      },
    ],
  },
  {
    id: generateId(),
    loc: "model.py:45", 
    mutations: [
      {
        event: "DICT_SET",
        name: "replacements",
        key: "ka",
        value: "kv",
      },
      {
        event: "ARRAY_PUSH",
        name: "my_array",
        value: 1,
      },
      {
        event: "VAR_SET",
        name: "symint_counter",
        value: "1",
      }
    ],
  },
  {
    id: generateId(),
    loc: "model.py:98",
    mutations: [
      {
        event: "SET_ADD",
        name: "divisible",
        key: "b",
      },
      {
        event: "ARRAY_PUSH",
        name: "my_array",
        value: 2,
      },
      {
        event: "VAR_SET",
        name: "symint_counter",
        value: "2",
      }
    ],
  },
  {
    id: generateId(),
    loc: "model.py:183",
    mutations: [
      {
        event: "SET_DELETE",
        name: "divisible",
        key: "a",
      },
      {
        event: "DICT_DELETE",
        name: "replacements",
        key: "ka",
      },
      {
        event: "ARRAY_POP",
        name: "my_array",
      },
      {
        event: "VAR_DELETE",
        name: "symint_counter"
      }
    ],
  }
];

let FLAG = true;

export default function Home() {
  const [state, setState] = useState<StateEntry[]>(EXAMPLE_STATE);
  const [dialogOpen, setDialogOpen] = useState(true);
  const [stateInput, setStateInput] = useState("");
  const locListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadState = async () => {
      if (!FLAG) {
        return;
      }
      setDialogOpen(true);
    };
    loadState();
  }, []);

  const handleStateSubmit = () => {
    if (stateInput) {
      let parsedState;
      try {
        const lines = [...new Set(stateInput.split('\n').filter(line => line.trim()))];
        parsedState = lines.flatMap(line => {
          try {
            const entry = JSON.parse(line);
            return [{...entry, id: generateId()}];
          } catch {
            try {
              const entry = eval(`(${line})`);
              return [{...entry, id: generateId()}];
            } catch {
              return [];
            }
          }
        });
      } catch {}
      if (Array.isArray(parsedState)) {
        FLAG = false;
        setState(parsedState);
        // Update stateNames when state changes
        const newStateNames = [
          ...new Set(parsedState.flatMap((s) => s.mutations.map((m) => m.name))),
        ];
        setStates(newStateNames.map((name, index) => ({
          name,
          selected: true,
        })));
      } else {
        alert("Invalid state format. Using example state instead.");
      }
    }
    setDialogOpen(false);
  };

  const initialStateNames = [
    ...new Set(state.flatMap((s) => s.mutations.map((m) => m.name))),
  ];
  const [stateNames, setStates] = useState(
    initialStateNames.map((name, index) => ({
      name,
      selected: index < 2,
    }))
  );
  const [selectedLoc, setSelectedLoc] = useState<string | null>(state[0].id);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedLoc) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault(); // Prevent default to avoid focus issues
          setSelectedLoc(state[0].id);
        }
        return;
      }

      const currentIndex = state.findIndex(s => s.id === selectedLoc);
      if (currentIndex === -1) return;

      if (e.key === "ArrowDown" && currentIndex < state.length - 1) {
        e.preventDefault();
        setSelectedLoc(state[currentIndex + 1].id);
      } else if (e.key === "ArrowUp" && currentIndex > 0) {
        e.preventDefault();
        setSelectedLoc(state[currentIndex - 1].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLoc]);

  useEffect(() => {
    if (selectedLoc && locListRef.current) {
      const element = locListRef.current.querySelector(`[data-id="${selectedLoc}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedLoc]);

  // Calculate state up to selected location and track where each value came from
  const getStateAtLoc = (stateName: string) => {
    if (!selectedLoc) return { state: [], origins: {} };

    const stateIndex = state.findIndex((s) => s.id === selectedLoc);
    if (stateIndex === -1) return { state: [], origins: {} };

    const relevantMutations = state.slice(0, stateIndex + 1)
      .flatMap((s) => s.mutations.map(m => ({...m, stateId: s.id})))
      .filter((m) => m.name === stateName);

    let currentState: Set<string> | number[] | Record<string, string> | string | null = null;
    let origins: Record<string, Record<string | number, string>> = {};

    relevantMutations.forEach((mutation) => {
      if (!currentState) {
        switch (mutation.event) {
          case "SET_ADD":
          case "SET_DELETE":
            currentState = new Set();
            break;
          case "ARRAY_PUSH":
          case "ARRAY_POP":
            currentState = [];
            break;
          case "VAR_SET":
          case "VAR_DELETE":
            currentState = "";
            break;
          default:
            currentState = {};
        }
      }

      origins[mutation.name] = origins[mutation.name] || {};

      switch (mutation.event) {
        case "SET_ADD":
          if (currentState instanceof Set) {
            currentState.add(mutation.key);
            origins[mutation.name][mutation.key] = mutation.stateId;
          }
          break;
        case "SET_DELETE":
          if (currentState instanceof Set) {
            currentState.delete(mutation.key);
            delete origins[mutation.name][mutation.key];
          }
          break;
        case "DICT_SET":
          if (typeof currentState === "object" && !(currentState instanceof Set)) {
            currentState[mutation.key] = mutation.value ?? "";
            origins[mutation.name][mutation.key] = mutation.stateId;
          }
          break;
        case "DICT_DELETE":
          if (typeof currentState === "object" && !(currentState instanceof Set)) {
            delete currentState[mutation.key];
            delete origins[mutation.name][mutation.key];
          }
          break;
        case "ARRAY_PUSH":
          if (Array.isArray(currentState)) {
            currentState.push(mutation.value);
            origins[mutation.name][currentState.length - 1] = mutation.stateId;
          }
          break;
        case "ARRAY_POP":
          if (Array.isArray(currentState)) {
            currentState.pop();
            delete origins[mutation.name][currentState.length];
          }
          break;
        case "VAR_SET":
          if (typeof currentState === "string") {
            currentState = mutation.value;
            origins[mutation.name]["value"] = mutation.stateId;
          }
          break;
        case "VAR_DELETE":
          if (typeof currentState === "string") {
            currentState = "";
            delete origins[mutation.name]["value"];
          }
          break;
      }
    });

    if (currentState instanceof Set) {
      return {
        state: Array.from(currentState),
        origins: origins[stateName] || {},
        currentLoc: selectedLoc
      };
    }

    return {
      state: currentState || [],
      origins: origins[stateName] || {},
      currentLoc: selectedLoc
    };
  };

  const selectedStates = stateNames.filter((s) => s.selected);

  const renderStateValue = (state: any, origins: Record<string | number, string>, currentLoc: string) => {
    console.log(typeof state);
    if (Array.isArray(state)) {
      return (
        <div className="space-y-1">
          {state.map((value, index) => (
            <div 
              key={index}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedLoc(origins[value] || origins[index]);
              }}
              className={`cursor-pointer hover:bg-accent/50 p-1 rounded ${
                (origins[value] || origins[index]) === currentLoc ? 'bg-accent' : ''
              }`}
            >
              {value}
            </div>
          ))}
        </div>
      );
    } else if (typeof state === 'object') {
      return (
        <div className="space-y-1">
          {Object.entries(state).map(([key, value]) => (
            <div 
              key={key}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(key)
                console.log(origins)
                setSelectedLoc(origins[key]);
              }}
              className={`cursor-pointer hover:bg-accent/50 p-1 rounded ${
                origins[key] === currentLoc ? 'bg-accent' : ''
              }`}
            >
              {key}: {String(value)}
            </div>
          ))}
        </div>
      );
    } else if (typeof state === 'string') {
      return (
        <div 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSelectedLoc(origins["value"]);
          }}
          className={`cursor-pointer hover:bg-accent/50 p-1 rounded ${
            origins["value"] === currentLoc ? 'bg-accent' : ''
          }`}
        >
          {state}
        </div>
      );
    }
    return state;
  };

  return (
    <div className="h-screen">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom State Data</DialogTitle>
            <DialogDescription>
              Would you like to provide your own state data? If not, an example will be used.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={`Paste your state data as JSON, one line of code (loc) per line... Example:

{"loc":"a.py:1","mutations":[{"event":"SET_ADD","name":"my_set","key":"a"}]}
{"loc":"a.py:2","mutations":[{"event":"SET_DELETE","name":"my_set","key":"a"}]}
{"loc":"a.py:3","mutations":[{"event":"DICT_SET","name":"my_dict","key":"k","value":"v"}]}
{"loc":"a.py:4","mutations":[{"event":"DICT_DELETE","name":"my_dict","key":"k"}]}
{"loc":"a.py:5","mutations":[{"event":"ARRAY_PUSH","name":"my_array","value":1}]}
{"loc":"a.py:6","mutations":[{"event":"ARRAY_POP","name":"my_array"}]}
{"loc":"a.py:7","mutations":[{"event":"VAR_SET","name":"status","value":"ready"}]}
{"loc":"a.py:8","mutations":[{"event":"VAR_DELETE","name":"status"}]}`}
            value={stateInput}
            onChange={(e) => setStateInput(e.target.value)}
            className="min-h-[400px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Use Example
            </Button>
            <Button onClick={handleStateSubmit}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResizablePanelGroup
        direction="horizontal"
        className="w-full rounded-lg border h-[800px]"
      >
        <ResizablePanel defaultSize={25}>
          <div className="flex h-full flex-col p-6 gap-2">
            <StatesSelector states={stateNames} setStates={setStates} />
            <div className="overflow-y-auto mt-4" ref={locListRef}>
              {state.map((state) => (
                <div key={state.id} data-id={state.id}>
                  <button
                    onClick={() => setSelectedLoc(state.id)}
                    className={`text-left p-2 rounded w-full hover:bg-border focus:outline-none ${
                      selectedLoc === state.id ? "bg-accent" : ""
                    }`}
                  >
                    {state.loc}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </ResizablePanel>
        {selectedStates.map((state, i) => (
          <React.Fragment key={state.name}>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={75 / selectedStates.length}>
              <div className="p-6 h-full overflow-y-auto">
                {selectedLoc ? (
                  <div className="space-y-4">
                    <h3 className="font-medium mb-2">{state.name}</h3>
                    <div>
                      {(() => {
                        const { state: stateValue, origins, currentLoc } = getStateAtLoc(state.name);
                        console.log(origins)
                        return renderStateValue(stateValue, origins, currentLoc);
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-muted-foreground">
                      Select a line to view state
                    </span>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </React.Fragment>
        ))}
      </ResizablePanelGroup>
    </div>
  );
}
