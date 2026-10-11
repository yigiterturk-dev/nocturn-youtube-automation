import { useEffect, useState } from "react";
import { Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BarChart3, CalendarDays, Check, ChevronRight, CircleDollarSign, Clock3, Command, FileText, Film, Images, LayoutDashboard, Mic2, Moon, MoreHorizontal, Play, Plus, Radar, Search, Settings, ShieldCheck, Sparkles, Sun, TrendingUp, Users, WandSparkles, Zap } from "lucide-react";
import type { Activity as ActivityType, Claim, Opportunity, ProductionJob, Source, Video } from "@shared/schema";
import { queryClient, apiRequest, setAuthToken, openProtectedFile } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";

type SessionMember = { id:string; email:string; displayName:string; role:string; workspaceId:string };

function LoginScreen({onLogin}:{onLogin:(token:string,member:SessionMember)=>void}) {
  const [email,setEmail]=useState("owner@signalforge.local"); const [password,setPassword]=useState(""); const [error,setError]=useState("");
  const submit=useMutation({mutationFn:async()=>{const response=await apiRequest("POST","/api/auth/login",{email,password});return response.json();},onSuccess:(data)=>onLogin(data.token,data.member),onError:(reason)=>setError(reason instanceof Error?reason.message:"Login failed")});
  return <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_.9fr]">
    <div className="hidden border-r bg-[#0c1016] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3"><ForgeMark/><span className="font-semibold">SignalForge</span></div><div className="max-w-xl"><p className="font-mono text-xs uppercase tracking-[.2em] text-[#f57967]">Editorial intelligence system</p><h1 className="mt-5 max-w-lg text-xl font-semibold leading-tight">Find the signal. Build the original story. Keep publishing human.</h1><div className="mt-8 grid grid-cols-3 gap-3 text-sm text-white/60"><div><strong className="block text-lg text-white">248</strong>active signals</div><div><strong className="block text-lg text-white">94%</strong>originality</div><div><strong className="block text-lg text-white">1</strong>human gate</div></div></div><p className="text-xs text-white/40">Private workspace · Production access controlled</p></div>
    <div className="grid place-items-center p-6"><Card className="w-full max-w-md"><CardHeader><div className="mb-4 lg:hidden"><ForgeMark/></div><CardTitle>Enter the control room</CardTitle><p className="text-sm text-muted-foreground">Use your SignalForge workspace credentials.</p></CardHeader><CardContent className="space-y-4"><div><label className="mb-2 block text-sm font-medium" htmlFor="login-email">Email</label><Input id="login-email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" data-testid="input-login-email"/></div><div><label className="mb-2 block text-sm font-medium" htmlFor="login-password">Password</label><Input id="login-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&password.length>=8)submit.mutate()}} autoComplete="current-password" data-testid="input-login-password"/></div>{error&&<p className="text-sm text-destructive" data-testid="text-login-error">{error}</p>}<Button className="w-full" disabled={password.length<8||submit.isPending} onClick={()=>submit.mutate()} data-testid="button-login">{submit.isPending?"Verifying…":"Sign in"}</Button><p className="text-xs text-muted-foreground">Sessions expire after 12 hours. Refreshing this private preview signs you out.</p></CardContent></Card></div>
  </div>;
}

type DashboardData = {
  metrics: { activeSignals: number; pipeline: number; weeklyViews: number; estimatedRevenue: number };
  performance: { day: string; views: number; ctr: number }[];
  opportunities: Opportunity[]; videos: Video[]; activity: ActivityType[];
  connectors: { youtube: { configured: boolean; region: string; categoryId: string; mode: string } };
};

const nav = [
  ["Command center", "/", LayoutDashboard], ["Trend radar", "/radar", Radar],
  ["Content pipeline", "/pipeline", FileText], ["Script studio", "/studio", WandSparkles],
  ["Publishing", "/calendar", CalendarDays], ["Analytics", "/analytics", BarChart3],
  ["Connections", "/settings", Settings],
] as const;

function ForgeMark() {
  return <svg aria-label="SignalForge" viewBox="0 0 32 32" className="size-7 text-primary"><path d="M4 18h6l3-8 5 14 3-6h7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="26" cy="18" r="2.5" fill="currentColor"/></svg>;
}

function AppSidebar() {
  const [location] = useLocation();
  return <Sidebar>
    <SidebarHeader className="p-4"><div className="flex items-center gap-3"><ForgeMark/><div><div className="font-semibold tracking-tight">SignalForge</div><div className="text-xs text-muted-foreground">Editorial OS</div></div></div></SidebarHeader>
    <SidebarContent>
      <SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
        {nav.map(([label,path,Icon]) => <SidebarMenuItem key={path}><SidebarMenuButton asChild isActive={location === path}><a href={`#${path}`} data-testid={`link-${label.toLowerCase().replaceAll(" ","-")}`}><Icon/><span>{label}</span></a></SidebarMenuButton></SidebarMenuItem>)}
      </SidebarMenu></SidebarGroupContent></SidebarGroup>
      <SidebarGroup><SidebarGroupLabel>Channel</SidebarGroupLabel><SidebarGroupContent><div className="mx-2 rounded-md bg-sidebar-accent p-3"><div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"><Play className="size-4"/></div><div className="min-w-0"><div className="truncate text-sm font-medium">Untold Systems</div><div className="text-xs text-muted-foreground">Launch sprint · Day 8</div></div></div><Progress className="mt-3 h-1.5" value={64}/></div></SidebarGroupContent></SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="p-3"><SidebarMenu><SidebarMenuItem><SidebarMenuButton><Settings/><span>Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu><div className="flex items-center gap-3 px-2 py-3"><div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">YE</div><div className="min-w-0 flex-1"><div className="text-sm font-medium">Editorial owner</div><div className="text-xs text-muted-foreground">Admin</div></div><MoreHorizontal className="size-4 text-muted-foreground"/></div></SidebarFooter>
  </Sidebar>;
}

function Metric({label,value,delta,icon:Icon}:{label:string;value:string;delta:string;icon:typeof Activity}) {
  return <Card data-testid={`metric-${label.toLowerCase().replaceAll(" ","-")}`}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight">{value}</p></div><div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="size-4"/></div></div><p className="mt-3 text-xs text-muted-foreground"><span className="font-medium text-emerald-600 dark:text-emerald-400">{delta}</span> vs last week</p></CardContent></Card>;
}

function OpportunityRow({item,onStart}:{item:Opportunity;onStart:(item:Opportunity)=>void}) {
  const raw=item.raw as {confidence?:number;scoreComponents?:Record<string,number>;isShort?:boolean};
  const outlier=raw.scoreComponents?.outlier;
  return <div className="grid gap-3 border-b border-border/70 px-5 py-4 last:border-0 lg:grid-cols-[1fr_100px_110px_90px] lg:items-center" data-testid={`row-opportunity-${item.id}`}>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{item.topic}</p><Badge variant="secondary">{item.signal}</Badge>{raw.isShort!==undefined&&<Badge variant="outline">{raw.isShort?"Short":"Long-form"}</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{item.niche} · {item.sourceCount} independent signals · {item.shelfLife}{raw.confidence?` · ${Math.round(raw.confidence)}% confidence`:""}</p></div>
    <div><p className="text-xs text-muted-foreground">Views/hour</p><p className="mt-1 font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">{Math.round(item.velocity).toLocaleString()}</p>{outlier!==undefined&&<p className="mt-1 text-xs text-muted-foreground">outlier {Math.round(outlier)}</p>}</div>
    <div><p className="text-xs text-muted-foreground">Opportunity</p><div className="mt-1 flex items-center gap-2"><Progress value={item.opportunity} className="h-1.5"/><span className="font-mono text-xs">{item.opportunity}</span></div></div>
    <Button size="sm" variant="outline" onClick={()=>onStart(item)} data-testid={`button-start-${item.id}`}>Start <ChevronRight className="ml-1 size-3"/></Button>
  </div>;
}

function PipelineRow({video,advance}:{video:Video;advance:(video:Video)=>void}) {
  return <div className="grid gap-3 border-b border-border/70 px-5 py-4 last:border-0 lg:grid-cols-[1fr_150px_110px_90px] lg:items-center" data-testid={`row-video-${video.id}`}>
    <div><p className="font-medium">{video.title}</p><p className="mt-1 text-xs text-muted-foreground">{video.niche} · {video.sourceCount} sources · Originality {video.originality}%</p></div>
    <div><Badge variant="outline">{video.status}</Badge><Progress value={video.progress} className="mt-2 h-1.5"/></div>
    <div><p className="text-xs text-muted-foreground">Due</p><p className="mt-1 text-sm">{video.due}</p></div>
    <Button size="sm" variant="ghost" onClick={()=>advance(video)} data-testid={`button-advance-${video.id}`}>Advance</Button>
  </div>;
}

function NewIdeaDialog() {
  const {toast}=useToast(); const [title,setTitle]=useState("");
  const create=useMutation({mutationFn:async()=> (await apiRequest("POST","/api/videos",{title,niche:"Editorial discovery",status:"Research",progress:10,owner:"Research",due:"Unscheduled",originality:70,sourceCount:0})).json(),onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/dashboard"]});setTitle("");toast({title:"Production brief created",description:"The idea is now in research."});}});
  return <Dialog><DialogTrigger asChild><Button data-testid="button-new-idea"><Plus className="mr-2 size-4"/>New idea</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Start a production brief</DialogTitle><DialogDescription>Add an original angle. Research and source validation happen next.</DialogDescription></DialogHeader><div className="space-y-4 pt-2"><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="The hidden system behind…" data-testid="input-idea-title"/><Button className="w-full" disabled={title.trim().length<8||create.isPending} onClick={()=>create.mutate()} data-testid="button-create-brief">{create.isPending?"Creating…":"Create brief"}</Button></div></DialogContent></Dialog>;
}

function EvidenceLedger({video}:{video:Video}) {
  const {toast}=useToast();
  const [sourceUrl,setSourceUrl]=useState(""); const [sourceTitle,setSourceTitle]=useState("");
  const [claimText,setClaimText]=useState("");
  const sourceKey=[`/api/videos/${video.id}/sources`];
  const claimKey=[`/api/videos/${video.id}/claims`];
  const {data:sources=[]}=useQuery<Source[]>({queryKey:sourceKey});
  const {data:claims=[]}=useQuery<Claim[]>({queryKey:claimKey});
  const addSource=useMutation({mutationFn:async()=>(await apiRequest("POST",`/api/videos/${video.id}/sources`,{url:sourceUrl,title:sourceTitle,publisher:null})).json(),onSuccess:()=>{setSourceUrl("");setSourceTitle("");queryClient.invalidateQueries({queryKey:sourceKey});queryClient.invalidateQueries({queryKey:["/api/dashboard"]});toast({title:"Source added",description:"Verify it after editorial inspection."});}});
  const toggleSource=useMutation({mutationFn:async(source:Source)=>(await apiRequest("PATCH",`/api/videos/${video.id}/sources/${source.id}`,{verified:!source.verified})).json(),onSuccess:()=>queryClient.invalidateQueries({queryKey:sourceKey})});
  const addClaim=useMutation({mutationFn:async()=>(await apiRequest("POST",`/api/videos/${video.id}/claims`,{text:claimText,sourceId:null})).json(),onSuccess:()=>{setClaimText("");queryClient.invalidateQueries({queryKey:claimKey});toast({title:"Claim added",description:"Attach evidence before script generation."});}});
  const verifyClaim=useMutation({mutationFn:async(claim:Claim)=>{const source=sources.find(item=>item.verified);if(!source)throw new Error("Verify at least one source first");return(await apiRequest("PATCH",`/api/videos/${video.id}/claims/${claim.id}/verify`,{sourceId:source.id,status:"supported",evidenceExcerpt:`Editorially verified against ${source.title}.`,confidence:85})).json();},onSuccess:()=>{queryClient.invalidateQueries({queryKey:claimKey});queryClient.invalidateQueries({queryKey:sourceKey});},onError:(error)=>toast({title:"Claim needs evidence",description:error instanceof Error?error.message:"Verification failed",variant:"destructive"})});
  const verifiedSources=sources.filter(item=>item.verified).length;
  const supportedClaims=claims.filter(item=>item.status==="supported").length;
  const coverage=claims.length?Math.round((supportedClaims/claims.length)*100):0;
  return <div className="mt-4 grid gap-4 xl:grid-cols-2">
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Source ledger</CardTitle><Badge variant={verifiedSources>=5?"default":"secondary"}>{verifiedSources}/5 verified</Badge></div><p className="mt-1 text-xs text-muted-foreground">Research generation unlocks after five independently reviewed sources.</p></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2"><div><label htmlFor="source-title" className="sr-only">Source title</label><Input id="source-title" placeholder="Source title" value={sourceTitle} onChange={event=>setSourceTitle(event.target.value)} data-testid="input-source-title"/></div><div><label htmlFor="source-url" className="sr-only">Source URL</label><Input id="source-url" type="url" placeholder="https://…" value={sourceUrl} onChange={event=>setSourceUrl(event.target.value)} data-testid="input-source-url"/></div></div>
      <Button size="sm" disabled={sourceTitle.trim().length<3||!sourceUrl.startsWith("http")||addSource.isPending} onClick={()=>addSource.mutate()} data-testid="button-add-source"><Plus className="mr-2 size-4"/>Add source</Button>
      <div className="space-y-2">{sources.length?sources.map(source=><div key={source.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3" data-testid={`row-source-${source.id}`}><div className="min-w-0"><p className="truncate text-sm font-medium">{source.title}</p><p className="truncate text-xs text-muted-foreground">{source.url}</p></div><Button size="sm" variant={source.verified?"default":"outline"} onClick={()=>toggleSource.mutate(source)} data-testid={`button-verify-source-${source.id}`}>{source.verified?<Check className="mr-1 size-3"/>:null}{source.verified?"Verified":"Verify"}</Button></div>):<p className="rounded-md bg-muted/40 p-4 text-sm text-muted-foreground">No sources yet. Add the first independent reference above.</p>}</div>
    </CardContent></Card>
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Claim coverage</CardTitle><span className="font-mono text-sm">{coverage}%</span></div><Progress className="mt-3" value={coverage}/></CardHeader><CardContent className="space-y-4">
      <div><label htmlFor="claim-text" className="sr-only">Factual claim</label><Input id="claim-text" placeholder="Add a material factual claim…" value={claimText} onChange={event=>setClaimText(event.target.value)} data-testid="input-claim-text"/></div>
      <Button size="sm" variant="outline" disabled={claimText.trim().length<8||addClaim.isPending} onClick={()=>addClaim.mutate()} data-testid="button-add-claim"><Plus className="mr-2 size-4"/>Add claim</Button>
      <div className="space-y-2">{claims.length?claims.map(claim=><div key={claim.id} className="flex items-start justify-between gap-3 rounded-md bg-muted/50 p-3" data-testid={`row-claim-${claim.id}`}><div><p className="text-sm">{claim.text}</p><p className="mt-1 text-xs text-muted-foreground">{claim.status==="supported"?`${claim.confidence}% confidence · evidence attached`:"Evidence pending"}</p></div>{claim.status==="unverified"&&<Button size="sm" variant="ghost" onClick={()=>verifyClaim.mutate(claim)} data-testid={`button-verify-claim-${claim.id}`}>Support</Button>}</div>):<p className="rounded-md bg-muted/40 p-4 text-sm text-muted-foreground">Claims extracted from the script will appear here for evidence review.</p>}</div>
    </CardContent></Card>
  </div>;
}

type HookResult={hook:string;verdict:number;band:string;formula:string;fix:string};
type TitleResult={title:string;thumbnailText:string;lint:{score:number;issues:{code:string;message:string}[]}};

function JobDetails({job}:{job:ProductionJob}) {
  const {toast}=useToast();
  const out=job.output as Record<string,any>;
  const open=(name:string,download?:boolean)=>openProtectedFile(`/api/production-jobs/${job.id}/files/${name}`,download?name:undefined).catch((error)=>toast({title:"File unavailable",description:error instanceof Error?error.message:"",variant:"destructive"}));
  if(job.status==="failed") return <p className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive" data-testid={`error-${job.kind}`}>{job.error}</p>;
  if(job.status==="queued"||job.status==="running") return <Progress className="mt-2 h-1.5" value={job.progress}/>;
  if(job.kind==="editorial_research"&&out.quality){
    const q=out.quality as {wordCount:number;hooks:HookResult[];titles:TitleResult[];problems:string[]};
    return <div className="mt-2 space-y-2 text-xs" data-testid="research-quality">
      <p className="text-muted-foreground">{q.wordCount} words · ~{Math.round(q.wordCount/150)} min · angle: {out.dossier?.angle}</p>
      <p><span className="font-medium">Best hook ({q.hooks[0]?.verdict}, {q.hooks[0]?.band}):</span> {q.hooks[0]?.hook}</p>
      <ul className="space-y-1">{q.titles.map(t=><li key={t.title}><span className="font-medium">{t.lint.score}</span> · {t.title} <span className="text-muted-foreground">/ thumb: {t.thumbnailText}</span>{t.lint.issues.length>0&&<span className="text-amber-600"> · {t.lint.issues.map(i=>i.code).join(", ")}</span>}</li>)}</ul>
      {q.problems.length>0&&<ul className="rounded bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">{q.problems.map(p=><li key={p}>• {p}</li>)}</ul>}
      <details><summary className="cursor-pointer text-muted-foreground">Read script</summary><div className="mt-2 max-h-80 space-y-3 overflow-auto whitespace-pre-wrap rounded bg-background p-3">{(out.dossier?.sections??[]).map((s:{chapter:string;narration:string})=><div key={s.chapter}><p className="font-medium">{s.chapter}</p><p>{s.narration}</p></div>)}</div></details>
    </div>;
  }
  if(job.kind==="visual_plan"&&out.plan) return <p className="mt-2 text-xs text-muted-foreground">{out.plan.scenes.length} scenes · {out.stockScenes} stock clips · {out.plan.shorts.length} Shorts planned · thumbnail “{out.plan.thumbnail.text}”</p>;
  if(job.kind==="voiceover"&&out.audio) return <p className="mt-2 text-xs text-muted-foreground">{out.durationSeconds}s narration · {out.characters} characters · {out.provider}</p>;
  if(job.kind==="render"&&out.report){
    const r=out.report as {durationSeconds:number;checks:Record<string,boolean>;shorts:{file:string;durationSeconds:number}[]};
    return <div className="mt-2 space-y-2 text-xs" data-testid="render-files">
      <p className="text-muted-foreground">{Math.floor(r.durationSeconds/60)}:{String(Math.round(r.durationSeconds%60)).padStart(2,"0")} · {Object.entries(r.checks).filter(([,ok])=>!ok).map(([name])=>name).join(", ")||"all checks pass"}</p>
      <div className="flex flex-wrap gap-1.5">{(out.files as string[]).map(name=><Button key={name} size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={()=>open(name,!/\.(mp4|png)$/.test(name))}>{name}</Button>)}</div>
    </div>;
  }
  return null;
}

function ProductionConsole({video}:{video:Video}) {
  const {toast}=useToast();
  const jobsKey=[`/api/production-jobs?videoId=${video.id}`];
  const {data:jobs=[],isLoading}=useQuery<ProductionJob[]>({queryKey:jobsKey,refetchInterval:(query)=>(query.state.data??[]).some(job=>job.status==="queued"||job.status==="running")?4000:false});
  const queue=useMutation({mutationFn:async(kind:"editorial_research"|"voiceover"|"visual_plan"|"render")=>(await apiRequest("POST",`/api/videos/${video.id}/production-jobs`,{kind})).json(),onSuccess:(job)=>{queryClient.invalidateQueries({queryKey:jobsKey});toast({title:"Production stage queued",description:job.status.replaceAll("_"," ")});}});
  const review=useMutation({mutationFn:async({job,status}:{job:ProductionJob;status:"completed"|"rejected"})=>(await apiRequest("PATCH",`/api/production-jobs/${job.id}/review`,{status,note:status==="completed"?"Owner reviewed and accepted this production artifact.":"Owner rejected this artifact; regenerate."})).json(),onSuccess:()=>queryClient.invalidateQueries({queryKey:jobsKey}),onError:(error)=>toast({title:"Artifact is not reviewable yet",description:error instanceof Error?error.message:"Provider output is required.",variant:"destructive"})});
  const approve=useMutation({mutationFn:async()=>(await apiRequest("PATCH",`/api/videos/${video.id}/publish-approval`,{approved:true,note:"Owner release approval after final render review."})).json(),onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/dashboard"]});toast({title:"Release approved",description:"Publishing authorization is now recorded."});},onError:(error)=>toast({title:"Release gate blocked",description:error instanceof Error?error.message:"Complete final render review first.",variant:"destructive"})});
  const stages=[
    {kind:"editorial_research" as const,label:"Script",description:"DeepSeek dossier, hook score and title lint (queued from Script studio)",icon:FileText},
    {kind:"visual_plan" as const,label:"Visual plan",description:"Scenes, stock footage, Shorts selection and thumbnail",icon:Images},
    {kind:"voiceover" as const,label:"Voiceover",description:"ElevenLabs narration with word timings",icon:Mic2},
    {kind:"render" as const,label:"Final render",description:"Episode, 3 Shorts, captions, chapters and upload package",icon:Film},
  ];
  return <section className="grid gap-4 xl:grid-cols-[1.5fr_.7fr]">
    <Card><CardHeader><CardTitle>Production assembly line</CardTitle><p className="mt-1 text-sm text-muted-foreground">{video.title}</p></CardHeader><CardContent className="space-y-3">{stages.map(({kind,label,description,icon:Icon})=>{const job=jobs.find(item=>item.kind===kind);return <div key={kind} className="grid gap-3 rounded-md bg-muted/50 p-4 sm:grid-cols-[1fr_auto] sm:items-center" data-testid={`stage-${kind}`}><div className="flex gap-3"><Icon className="mt-0.5 size-4 text-primary"/><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p>{job&&<Badge className="mt-2" variant={job.status==="completed"?"default":"secondary"}>{job.status.replaceAll("_"," ")}</Badge>}</div></div><div className="flex gap-2">{kind!=="editorial_research"&&<Button size="sm" variant="outline" disabled={queue.isPending||job?.status==="running"} onClick={()=>queue.mutate(kind)} data-testid={`button-queue-${kind}`}>{job?"Queue again":"Queue"}</Button>}{job?.status==="ready_for_review"&&<><Button size="sm" disabled={review.isPending} onClick={()=>review.mutate({job,status:"completed"})} data-testid={`button-review-${kind}`}>Approve</Button><Button size="sm" variant="ghost" disabled={review.isPending} onClick={()=>review.mutate({job,status:"rejected"})} data-testid={`button-reject-${kind}`}>Reject</Button></>}</div>{job&&<div className="sm:col-span-2"><JobDetails job={job}/></div>}</div>})}{isLoading&&<p className="text-sm text-muted-foreground">Loading production jobs…</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Release authority</CardTitle><p className="mt-1 text-sm text-muted-foreground">Upload and scheduling remain separate from artifact production.</p></CardHeader><CardContent><div className="rounded-md bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300"><ShieldCheck className="mb-3 size-5"/>Only the workspace owner can approve release, and only after a completed render review.</div><Button className="mt-4 w-full" disabled={approve.isPending||video.publishApproved} onClick={()=>approve.mutate()} data-testid="button-approve-release">{video.publishApproved?"Release approved":"Approve final release"}</Button><p className="mt-3 text-xs text-muted-foreground">This records authority only. YouTube upload scope is still disabled.</p></CardContent></Card>
  </section>;
}

const titles:Record<string,[string,string]>={
  dashboard:["Command center","Signals, production, quality and channel health in one view."],
  radar:["Trend radar","High-momentum topics scored for originality, timing and production fit."],
  pipeline:["Content pipeline","Every episode from research to final human publishing approval."],
  studio:["Script studio","Source-led narrative development with originality safeguards."],
  calendar:["Publishing control","Human-approved releases and channel cadence."],
  analytics:["Channel intelligence","Turn audience behavior into the next editorial decision."]
};

function Dashboard({view="dashboard"}:{view?:string}) {
  const {toast}=useToast(); const {data,isLoading}=useQuery<DashboardData>({queryKey:["/api/dashboard"]});
  const {data:aiStatus}=useQuery<{configured:boolean;model:string;execution:string}>({queryKey:["/api/ai/status"],enabled:view==="studio"});
  const {data:radarStatus}=useQuery<{version:string;scoring:string[];deduplication:string;historicalSnapshots:boolean;watchlists:number;lastSnapshotAt:string|null}>({queryKey:["/api/radar/status"],enabled:view==="radar"});
  const advance=useMutation({mutationFn:async(video:Video)=>{const s=["Research","Script","Editorial review","Visual production","Ready to publish"];const next=s[Math.min(s.indexOf(video.status)+1,s.length-1)];return(await apiRequest("PATCH",`/api/videos/${video.id}`,{status:next,progress:Math.min(video.progress+18,100)})).json();},onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/dashboard"]});toast({title:"Pipeline updated"});}});
  const start=useMutation({mutationFn:async(item:Opportunity)=>(await apiRequest("POST","/api/videos",{title:item.topic,niche:item.niche,status:"Research",progress:10,owner:"Research",due:"Unscheduled",originality:75,sourceCount:item.sourceCount})).json(),onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/dashboard"]});toast({title:"Opportunity moved to production"});}});
  const scan=useMutation({mutationFn:async()=>(await apiRequest("POST","/api/radar/scan")).json(),onSuccess:(result)=>{queryClient.invalidateQueries({queryKey:["/api/dashboard"]});toast({title:`${result.count} live signals imported`});},onError:(error)=>toast({title:"YouTube connector is in demo mode",description:error instanceof Error?error.message:"Add YOUTUBE_API_KEY to run a live scan.",variant:"destructive"})});
  const research=useMutation({mutationFn:async(videoId:string)=>(await apiRequest("POST",`/api/videos/${videoId}/research`)).json(),onSuccess:(job)=>toast({title:"Editorial research queued",description:job.status==="waiting_for_provider"?"Waiting for a server-side OpenAI API key.":"Provider activation is required before execution."}),onError:(error)=>toast({title:"Could not queue research",description:error instanceof Error?error.message:"Unknown error",variant:"destructive"})});
  if(isLoading||!data)return <div className="grid h-full place-items-center text-muted-foreground"><Zap className="size-5 animate-pulse"/></div>;
  const [title,subtitle]=titles[view]||titles.dashboard;
  return <main className="mx-auto w-full max-w-[1500px] p-4 md:p-6 lg:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[.18em] text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500"/>Live workspace</div><h1 className="text-xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div><NewIdeaDialog/></div>
    {(view==="dashboard"||view==="analytics")&&<><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active signals" value={String(data.metrics.activeSignals)} delta="+18%" icon={Radar}/><Metric label="In pipeline" value={String(data.metrics.pipeline)} delta="+3" icon={Activity}/><Metric label="Weekly views" value={`${Math.round(data.metrics.weeklyViews/1000)}K`} delta="+24.6%" icon={TrendingUp}/><Metric label="Est. revenue" value={`$${data.metrics.estimatedRevenue.toLocaleString()}`} delta="+12.1%" icon={CircleDollarSign}/></section>
      <section className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]"><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>Seven-day signal</CardTitle><p className="mt-1 text-xs text-muted-foreground">Views in thousands · CTR overlay</p></div><Badge variant="outline">Live model</Badge></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.performance}><defs><linearGradient id="signal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity=".35"/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0"/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))"/><XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12}/><YAxis tickLine={false} axisLine={false} fontSize={12}/><Tooltip contentStyle={{background:"hsl(var(--popover))",border:"1px solid hsl(var(--border))",borderRadius:6}}/><Area type="monotone" dataKey="views" stroke="hsl(var(--primary))" fill="url(#signal)" strokeWidth={2}/></AreaChart></ResponsiveContainer></CardContent></Card>
      <Card><CardHeader><CardTitle>System activity</CardTitle></CardHeader><CardContent className="space-y-4">{data.activity.map(item=><div key={item.id} className="flex gap-3" data-testid={`activity-${item.id}`}><div className={`mt-1 grid size-6 shrink-0 place-items-center rounded-full ${item.kind==="warning"?"bg-amber-500/15 text-amber-500":"bg-emerald-500/15 text-emerald-500"}`}>{item.kind==="warning"?<Clock3 className="size-3"/>:<Check className="size-3"/>}</div><div><p className="text-sm leading-snug">{item.message}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p></div></div>)}</CardContent></Card></section></>}
    {(view==="dashboard"||view==="radar")&&<Card className="mt-4"><CardHeader className="flex flex-row items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><CardTitle>Opportunity queue</CardTitle><Badge variant={data.connectors.youtube.configured?"default":"secondary"}>{data.connectors.youtube.configured?`YouTube live · ${data.connectors.youtube.region}`:"YouTube demo"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Ranked by velocity, competition, shelf life and source quality.</p></div><Button variant="ghost" size="sm" onClick={()=>scan.mutate()} disabled={scan.isPending} data-testid="button-scan-youtube"><Search className="mr-2 size-4"/>{scan.isPending?"Scanning…":"Scan now"}</Button></CardHeader><CardContent className="p-0">{data.opportunities.map(item=><OpportunityRow key={item.id} item={item} onStart={v=>start.mutate(v)}/>)}</CardContent></Card>}
    {view==="radar"&&radarStatus&&<Card className="mt-4"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Radar engine v{radarStatus.version}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Auditable scoring, historical snapshots and video-ID deduplication.</p></div><Badge variant="outline">{radarStatus.watchlists} active watchlist</Badge></div></CardHeader><CardContent><div className="flex flex-wrap gap-2">{radarStatus.scoring.map(component=><Badge key={component} variant="secondary">{component.replaceAll("_"," ")}</Badge>)}</div><p className="mt-4 text-xs text-muted-foreground">{radarStatus.lastSnapshotAt?`Last market snapshot ${new Date(radarStatus.lastSnapshotAt).toLocaleString()}`:"Waiting for the first live market snapshot."}</p></CardContent></Card>}
    {(view==="dashboard"||view==="pipeline"||view==="calendar")&&<Card className="mt-4"><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>Production pipeline</CardTitle><p className="mt-1 text-xs text-muted-foreground">Publishing stays locked until editorial approval.</p></div><Badge variant="outline"><ShieldCheck className="mr-1 size-3"/>Human gate active</Badge></CardHeader><CardContent className="p-0">{data.videos.map(video=><PipelineRow key={video.id} video={video} advance={v=>advance.mutate(v)}/>)}</CardContent></Card>}
    {view==="calendar"&&data.videos[0]&&<div className="mt-4"><ProductionConsole video={data.videos[0]}/></div>}
    {view==="studio"&&<><div className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]"><Card><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Narrative workspace</CardTitle><p className="mt-1 text-xs text-muted-foreground">Evidence-led dossier and structured script generation.</p></div><Badge variant={aiStatus?.configured?"default":"secondary"}>{aiStatus?.configured?aiStatus.model:"Provider waiting"}</Badge></CardHeader><CardContent><div className="rounded-md bg-muted/50 p-5"><Badge variant="secondary">Hook</Badge><h2 className="mt-4 text-lg font-semibold">The ocean is quietly becoming the world’s next data center.</h2><p className="mt-4 leading-7 text-muted-foreground">In the next eight minutes, we trace why technology companies are testing submerged infrastructure, what the physics gets right, and where the economics still break.</p><div className="mt-6 flex flex-wrap gap-2"><Button onClick={()=>data.videos[0]&&research.mutate(data.videos[0].id)} disabled={!data.videos[0]||research.isPending} data-testid="button-queue-research"><Sparkles className="mr-2 size-4"/>{research.isPending?"Queuing…":"Queue research dossier"}</Button></div></div></CardContent></Card><Card><CardHeader><CardTitle>Editorial guard</CardTitle></CardHeader><CardContent className="space-y-4">{[["Originality",94],["Narrative variation",89]].map(([label,score])=><div key={label as string}><div className="mb-2 flex justify-between gap-3 text-sm"><span>{label}</span><span className="font-mono">{score}%</span></div><Progress value={score as number}/></div>)}<div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"><ShieldCheck className="mb-2 size-4"/>Publishing remains locked behind owner approval.</div></CardContent></Card></div>{data.videos[0]&&<EvidenceLedger video={data.videos[0]}/>}</>}
  </main>;
}

function ConnectionSettings() {
  const {toast}=useToast();
  const {data,isLoading}=useQuery<{configured:boolean;redirectUri:string|null;scopes:string[]}>({queryKey:["/api/youtube/oauth/status"]});
  const connect=useMutation({mutationFn:async()=>(await apiRequest("POST","/api/youtube/oauth/start")).json(),onSuccess:(result)=>{window.location.assign(result.authorizationUrl)},onError:(error)=>toast({title:"Google OAuth is not configured",description:error instanceof Error?error.message:"Add Google OAuth credentials.",variant:"destructive"})});
  return <main className="mx-auto w-full max-w-5xl p-4 md:p-6 lg:p-8"><div className="mb-6"><div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[.18em] text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500"/>Workspace security</div><h1 className="text-xl font-semibold tracking-tight">Connections</h1><p className="mt-1 text-sm text-muted-foreground">External credentials stay encrypted on the server and are never sent back to the browser.</p></div>
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>YouTube channel</CardTitle><p className="mt-1 text-sm text-muted-foreground">Read channel metadata, analytics and revenue reports.</p></div><Badge variant={data?.configured?"default":"secondary"}>{isLoading?"Checking":data?.configured?"Ready":"Needs config"}</Badge></CardHeader><CardContent><div className="space-y-3 rounded-md bg-muted/50 p-4 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Access</span><span>Read-only + analytics</span></div><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Publishing</span><span>Locked</span></div><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Token storage</span><span>AES-256-GCM</span></div></div><Button className="mt-4 w-full" onClick={()=>connect.mutate()} disabled={!data?.configured||connect.isPending} data-testid="button-connect-youtube">{connect.isPending?"Preparing consent…":"Connect YouTube"}</Button>{!data?.configured&&<p className="mt-3 text-xs text-muted-foreground">Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and the exact redirect URI to enable consent.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Publishing authority</CardTitle><p className="mt-1 text-sm text-muted-foreground">Upload permission is deliberately separated from analytics access.</p></CardHeader><CardContent><div className="rounded-md bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300"><ShieldCheck className="mb-3 size-5"/>No video can be uploaded or scheduled until an owner explicitly enables the publishing scope and approves the release gate.</div><Button variant="outline" className="mt-4 w-full" disabled>Enable after channel verification</Button></CardContent></Card></div>
  </main>;
}

function Shell({children,member,onLogout}:{children:React.ReactNode;member:SessionMember;onLogout:()=>void}) {
  const [dark,setDark]=useState(true); useEffect(()=>{document.documentElement.classList.toggle("dark",dark)},[dark]);
  return <SidebarProvider style={{"--sidebar-width":"17rem","--sidebar-width-icon":"4rem"} as React.CSSProperties}><div className="flex h-screen w-full overflow-hidden"><AppSidebar/><div className="flex min-w-0 flex-1 flex-col"><header className="z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background/90 px-4 backdrop-blur md:px-6"><div className="flex items-center gap-3"><SidebarTrigger data-testid="button-sidebar-toggle"/><div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex"><Command className="size-4"/><span>Creator intelligence online</span></div></div><div className="flex items-center gap-2"><Badge variant="outline" className="hidden sm:flex">{member.role}</Badge><Button variant="ghost" size="icon" onClick={()=>setDark(!dark)} aria-label="Toggle theme" data-testid="button-theme-toggle">{dark?<Sun/>:<Moon/>}</Button><Button variant="outline" size="sm" onClick={onLogout} data-testid="button-logout"><Users className="mr-2 size-4"/>Sign out</Button></div></header><div className="flex-1 overflow-y-auto">{children}</div></div></div></SidebarProvider>;
}

function AppRoutes({member,onLogout}:{member:SessionMember;onLogout:()=>void}){return <Shell member={member} onLogout={onLogout}><Switch><Route path="/"><Dashboard/></Route><Route path="/radar"><Dashboard view="radar"/></Route><Route path="/pipeline"><Dashboard view="pipeline"/></Route><Route path="/studio"><Dashboard view="studio"/></Route><Route path="/calendar"><Dashboard view="calendar"/></Route><Route path="/analytics"><Dashboard view="analytics"/></Route><Route path="/settings"><ConnectionSettings/></Route><Route><Dashboard/></Route></Switch></Shell>}
function AuthenticatedApp(){
  const [session,setSession]=useState<{token:string;member:SessionMember}|null>(null);
  const handleLogin=(token:string,member:SessionMember)=>{setAuthToken(token);setSession({token,member});queryClient.clear();};
  const handleLogout=async()=>{if(session)await apiRequest("POST","/api/auth/logout");setAuthToken(null);setSession(null);queryClient.clear();};
  return session?<Router hook={useHashLocation}><AppRoutes member={session.member} onLogout={handleLogout}/></Router>:<LoginScreen onLogin={handleLogin}/>;
}
export default function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><AuthenticatedApp/><Toaster/></TooltipProvider></QueryClientProvider>}
