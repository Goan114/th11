#pragma once
#include <cstdint>
namespace th11::input {
// Touch-only input assistance. The game's PlayerMotion::update_warp remains
// authoritative: push into edge, release for one tick, then push again.
class GapInput {
    bool held=false,blocked=false,spent=false;int phase=0;
    std::uint32_t direction=0;
public:
    void hold(bool value){if(value!=held){held=value;blocked=spent=false;phase=0;direction=0;}}
    void cancel(){held=false;blocked=true;spent=false;phase=0;direction=0;}
    bool sample(bool eligible,float x,int warp,std::uint32_t& keys){
        if(!held)return false;
        if(!eligible){blocked=true;return false;}
        if(blocked)return false;
        if(spent){keys=0;return true;}
        if(!direction){if(x<=-184)direction=0x40;else if(x>=184)direction=0x80;else return false;}
        if(warp>=99){spent=true;keys=0;return true;}
        keys=phase==1?0:direction;
        if(phase<2)++phase;
        return true;
    }
};
}
