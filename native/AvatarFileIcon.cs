using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

// Patch only fixed-size icon pixels. PE offsets, version resources and the
// complete NSIS payload remain byte-identical; never run a general PE rewriter.
static class AvatarFileIcon {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
    static extern void SHChangeNotify(uint change, uint flags, string item, IntPtr other);
    static readonly int[] Sizes = {16,24,32,48,64,128,256};
    sealed class Slot { public int Offset, Size, Width, Height; }
    static int U16(byte[] b,int at){return BitConverter.ToUInt16(b,at);}
    static int I32(byte[] b,int at){return BitConverter.ToInt32(b,at);}
    static void Put(byte[] b,int at,int value){Array.Copy(BitConverter.GetBytes(value),0,b,at,4);}
    static void Check(bool ok,string message){if(!ok)throw new InvalidDataException(message);}
    static int DibSize(int width,int height){return 40+width*height*4+((width+31)/32)*4*height;}
    static byte[] Dib(Bitmap source,int width,int height){
        byte[] b=new byte[DibSize(width,height)];
        Put(b,0,40);Put(b,4,width);Put(b,8,height*2);b[12]=1;b[14]=32;Put(b,20,width*height*4);
        int mask=40+width*height*4,stride=((width+31)/32)*4;
        for(int y=0;y<height;y++)for(int x=0;x<width;x++){
            Color p=source.GetPixel(x*source.Width/width,y*source.Height/height);
            int at=40+((height-1-y)*width+x)*4;
            b[at]=p.B;b[at+1]=p.G;b[at+2]=p.R;b[at+3]=p.A;
            if(p.A==0)b[mask+(height-1-y)*stride+x/8]|=(byte)(0x80>>(x%8));
        }
        return b;
    }
    static void BuildIco(string png,string destination){
        using(Bitmap source=new Bitmap(png))using(var stream=File.Create(destination))using(var writer=new BinaryWriter(stream)){
            writer.Write((ushort)0);writer.Write((ushort)1);writer.Write((ushort)Sizes.Length);
            int offset=6+16*Sizes.Length;
            foreach(int n in Sizes){
                writer.Write((byte)(n==256?0:n));writer.Write((byte)(n==256?0:n));writer.Write((ushort)0);
                writer.Write((ushort)1);writer.Write((ushort)32);writer.Write(DibSize(n,n));writer.Write(offset);offset+=DibSize(n,n);
            }
            foreach(int n in Sizes)writer.Write(Dib(source,n,n));
        }
    }
    static List<Slot> Slots(byte[] bytes){
        Check(bytes.Length>256&&bytes[0]==77&&bytes[1]==90,"Invalid executable");
        int pe=I32(bytes,60);Check(pe>=64&&pe+24<bytes.Length&&I32(bytes,pe)==0x4550,"Invalid PE header");
        int optional=pe+24,table=optional+(U16(bytes,optional)==0x20b?112:96);
        Check(I32(bytes,table+32)==0&&I32(bytes,table+36)==0,"Signed executables cannot be personalized");
        int sections=optional+U16(bytes,pe+20),count=U16(bytes,pe+6);
        Func<int,int> raw=rva=>{
            for(int i=0;i<count;i++){
                int at=sections+i*40,start=I32(bytes,at+12),length=I32(bytes,at+16);
                if(rva>=start&&rva-start<length)return checked(I32(bytes,at+20)+rva-start);
            }
            throw new InvalidDataException("Resource outside PE sections");
        };
        int root=raw(I32(bytes,table+16));var result=new List<Slot>();
        Action<int,int> visit=null;
        visit=(directory,depth)=>{
            Check(depth<=2&&directory>=root&&directory+16<bytes.Length,"Invalid icon directory");
            int entries=U16(bytes,directory+12)+U16(bytes,directory+14);
            Check(entries<1024&&directory+16+entries*8<=bytes.Length,"Invalid icon entries");
            for(int i=0;i<entries;i++){
                int at=directory+16+i*8,value=I32(bytes,at+4);
                if(depth==0&&I32(bytes,at)!=3)continue;
                if(value<0){visit(checked(root+(value&0x7fffffff)),depth+1);continue;}
                Check(depth==2,"Invalid icon tree");
                int data=checked(root+value),offset=raw(I32(bytes,data)),size=I32(bytes,data+4);
                Check(size>=40&&offset>=0&&offset+size<=bytes.Length&&I32(bytes,offset)==40,"This build has no editable icon slots");
                int width=I32(bytes,offset+4),height=I32(bytes,offset+8)/2;
                Check(width>=16&&width<=256&&height==width&&U16(bytes,offset+14)==32&&size==DibSize(width,height),"Invalid icon slot");
                result.Add(new Slot{Offset=offset,Size=size,Width=width,Height=height});
            }
        };
        visit(root,0);Check(result.Count>=Sizes.Length,"Incomplete avatar icon slots");return result;
    }
    static bool Apply(string target,string png,string version){
        // The NSIS wrapper and Electron image must both have released their locks.
        using(var file=new FileStream(target,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){}
        var info=FileVersionInfo.GetVersionInfo(target);
        Check(info.ProductName=="MiaoCL"&&info.ProductVersion==version,"Executable changed since avatar was selected");
        byte[] original=File.ReadAllBytes(target),updated=(byte[])original.Clone();
        using(Bitmap source=new Bitmap(png)){
            Check(source.Width<=512&&source.Height<=512,"Invalid avatar dimensions");
            foreach(var slot in Slots(updated))Array.Copy(Dib(source,slot.Width,slot.Height),0,updated,slot.Offset,slot.Size);
        }
        bool changed=false;for(int i=0;i<updated.Length;i++)if(original[i]!=updated[i]){changed=true;break;}
        if(!changed)return false;
        string staged=target+".avatar-"+Guid.NewGuid().ToString("N")+".tmp";
        try {
            File.WriteAllBytes(staged,updated);
            // Re-check under an exclusive handle, then let ReplaceFile atomically
            // refuse any new image lock; no partial writes to the original EXE.
            using(var file=new FileStream(target,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){
                Check(file.Length==original.Length,"Executable replaced during avatar update");
                byte[] probe=new byte[original.Length];int read=0,n;
                while(read<probe.Length&&(n=file.Read(probe,read,probe.Length-read))>0)read+=n;
                Check(read==probe.Length,"Executable read failed");
                for(int i=0;i<probe.Length;i++)Check(probe[i]==original[i],"Executable replaced during avatar update");
            }
            File.Replace(staged,target,null);
            SHChangeNotify(0x00002000,0x0005,target,IntPtr.Zero); // UPDATEITEM, PATHW
            SHChangeNotify(0x00001000,0x0005,Path.GetDirectoryName(target),IntPtr.Zero);
            return true;
        } finally {if(File.Exists(staged))File.Delete(staged);}
    }
    [STAThread] static int Main(string[] args){
        try {
            if(args.Length==3&&args[0]=="--build-ico"){BuildIco(args[1],args[2]);return 0;}
            Check(args.Length==5&&args[0]=="--apply","Invalid avatar job");
            string target=Path.GetFullPath(args[1]),png=Path.GetFullPath(args[2]),report=args[4];
            string last="";
            for(int attempt=0;attempt<120;attempt++){
                try {bool changed=Apply(target,png,args[3]);File.WriteAllText(report,changed?"updated":"unchanged");return 0;}
                catch(IOException e){last=e.Message;Thread.Sleep(500);}
            }
            File.WriteAllText(report,"error: "+last);return 1;
        } catch(Exception e){if(args.Length==5)try{File.WriteAllText(args[4],"error: "+e.Message);}catch{}return 1;}
    }
}
